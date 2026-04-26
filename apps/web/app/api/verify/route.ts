import { NextResponse } from "next/server";
import { type VerificationMode, type VerifyApiError, type VerifyApiSuccess } from "../../../lib/models";
import { getAuthenticatedUser } from "../../../lib/server/auth";
import { appendHistoryForUser, getDailyLimit, incrementUsageForToday, trackEvent } from "../../../lib/server/store";
import { buildResponsesForPrompt, verifyResponses } from "../../../lib/verifier";

interface VerifyRequestBody {
  prompt?: string;
  mode?: VerificationMode;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Please login to verify." } as VerifyApiError, { status: 401 });
  }

  if (user.usedToday >= user.dailyLimit) {
    return NextResponse.json(
      {
        ok: false,
        message: `Daily limit reached for ${user.plan} plan (${user.dailyLimit}/day). Upgrade to Pro for higher limits.`
      } as VerifyApiError,
      { status: 429 }
    );
  }

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
    await trackEvent("verification_started", user.userId, { mode });
    const providerFlow = await buildResponsesForPrompt(prompt, mode);
    const verification = verifyResponses(providerFlow.responses, providerFlow.modelSources, providerFlow.evidenceSnippets, mode);
    const usageUpdate = await incrementUsageForToday(user.userId);
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

    const payload: VerifyApiSuccess = {
      ok: true,
      verification,
      responses: providerFlow.responses,
      modelSources: providerFlow.modelSources,
      evidenceSnippets: providerFlow.evidenceSnippets,
      meta: providerFlow.meta,
      usage: {
        plan: user.plan,
        usedToday: usageUpdate?.usedToday ?? user.usedToday + 1,
        dailyLimit: getDailyLimit(user.plan)
      }
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
