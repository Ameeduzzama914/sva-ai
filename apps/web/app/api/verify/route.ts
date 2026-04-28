import { NextResponse } from "next/server";
import { type VerificationMode, type VerifyApiError, type VerifyApiSuccess } from "../../../lib/models";
import { getAuthenticatedUser } from "../../../lib/server/auth";
import { appendHistoryForUser, consumeDailyVerificationQuota, getDailyLimit, trackEvent } from "../../../lib/server/store";
import { buildResponsesForPrompt, verifyResponses } from "../../../lib/verifier";

interface VerifyRequestBody {
  prompt?: string;
  mode?: VerificationMode;
}

const withTimeout = async <T>(promise: Promise<T>, ms = 18000): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Verification timed out.")), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

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

    const providerFlow = await withTimeout(buildResponsesForPrompt(prompt, mode), 18000);
    const safeEvidenceSnippets =
      providerFlow.evidenceSnippets.length > 0
        ? providerFlow.evidenceSnippets
        : [
            {
              title: "Fallback Evidence Notice",
              text: "No external evidence could be retrieved. Confidence is based mainly on model agreement, so the result should be treated cautiously.",
              sourceType: "mock_web" as const,
              sourceId: "fallback-evidence-notice",
              relevanceScore: 35,
              sourceQualityScore: 45
            }
          ];
    const validResponses = providerFlow.responses.filter((response) => response.answer && response.answer.trim().length > 0);

    if (validResponses.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          message: "Not enough valid AI responses were returned. Please try again."
        } as VerifyApiError,
        { status: 500 }
      );
    }

    const verification = verifyResponses(validResponses, providerFlow.modelSources, safeEvidenceSnippets, mode);

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
      evidenceSnippets: safeEvidenceSnippets,
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
