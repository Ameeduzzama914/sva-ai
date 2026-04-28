import { NextResponse } from "next/server";
import { type VerificationMode, type VerifyApiError, type VerifyApiSuccess } from "../../../lib/models";
import { getAuthenticatedUser } from "../../../lib/server/auth";
import { appendHistoryForUser, consumeDailyVerificationQuota, getDailyLimit, trackEvent } from "../../../lib/server/store";
import { buildResponsesForPrompt, verifyResponses } from "../../../lib/verifier";

interface VerifyRequestBody {
  prompt?: string;
  mode?: VerificationMode;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();

  let body: VerifyRequestBody;

  try {
    body = (await request.json()) as VerifyRequestBody;
  } catch {
    const payload: VerifyApiError = {
      ok: false,
      message: "Invalid request body. Please send valid JSON with a prompt field."
    };

    return NextResponse.json(payload, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  const mode: VerificationMode = body.mode === "deep" || body.mode === "research" ? body.mode : "fast";

  if (!prompt) {
    const payload: VerifyApiError = {
      ok: false,
      message: "Please enter a prompt before verification."
    };

    return NextResponse.json(payload, { status: 400 });
  }

  try {
    if (user) {
      await trackEvent("verification_started", user.userId, { mode });
    }

    const providerFlow = await buildResponsesForPrompt(prompt, mode);
    const verification = verifyResponses(providerFlow.responses, providerFlow.modelSources, providerFlow.evidenceSnippets, mode);

    let usage = {
      plan: (user?.plan ?? "free") as "free" | "pro",
      usedToday: user?.usedToday ?? 0,
      dailyLimit: user?.dailyLimit ?? getDailyLimit("free")
    };

    if (user) {
      const quota = await consumeDailyVerificationQuota(user.userId);
      if (!quota) {
        return NextResponse.json({ ok: false, message: "User session not found." } as VerifyApiError, { status: 401 });
      }
      if (!quota.ok) {
        return NextResponse.json(
          {
            ok: false,
            message: `Daily limit reached for ${quota.plan} plan (${quota.dailyLimit}/day). Upgrade to Pro for higher limits.`
          } as VerifyApiError,
          { status: 429 }
        );
      }

      await appendHistoryForUser(user.userId, {
        prompt,
        mode,
        resultSummary: verification.finalAnswer,
        timestamp: new Date().toISOString(),
        confidence: verification.finalConfidenceScore,
        verdict: verification.judgeVerdict ?? "caution"
      });
      await trackEvent("verification_completed", user.userId, {
        mode,
        confidence: verification.finalConfidenceScore,
        verdict: verification.judgeVerdict ?? "caution"
      });

      usage = {
        plan: quota.plan,
        usedToday: quota.usedToday,
        dailyLimit: quota.dailyLimit
      };
    }

    const payload: VerifyApiSuccess = {
      ok: true,
      verification,
      responses: providerFlow.responses,
      modelSources: providerFlow.modelSources,
      evidenceSnippets: providerFlow.evidenceSnippets,
      meta: providerFlow.meta,
      usage
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error("Verification pipeline failed.", {
      message: error instanceof Error ? error.message : "Unknown error"
    });

    const payload: VerifyApiError = {
      ok: false,
      message: "Verification failed due to a server error. Please try again."
    };

    return NextResponse.json(payload, { status: 500 });
  }
}
