import { NextResponse } from "next/server";
import { type VerificationMode, type VerificationUsageSummary, type VerifyApiError, type VerifyApiSuccess } from "../../../lib/models";
import { getAuthenticatedUser } from "../../../lib/server/auth";
import { appendHistoryForUser, consumeVerificationCredits, getDailyLimit, getVerificationCreditCost, trackEvent, type PublicUser } from "../../../lib/server/store";
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

const consumeResolvedSessionCredits = (
  user: PublicUser,
  mode: VerificationMode
): { ok: true; creditsRemaining: number; creditsUsed: number; plan: PublicUser["plan"] } | { ok: false; creditsRemaining: number; creditsUsed: number; plan: PublicUser["plan"] } => {
  const creditsUsed = getVerificationCreditCost(mode);
  const creditsRemaining = user.creditsRemaining;

  if (creditsRemaining < creditsUsed) {
    return { ok: false, creditsRemaining, creditsUsed, plan: user.plan };
  }

  return { ok: true, creditsRemaining: creditsRemaining - creditsUsed, creditsUsed, plan: user.plan };
};

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);

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

    const verificationPlan = user?.plan ?? "free";
    const providerFlow = await withTimeout(buildResponsesForPrompt(prompt, mode, verificationPlan), 18000);
    const safeEvidenceSnippets = providerFlow.evidenceSnippets;
    const validResponses = providerFlow.responses.filter((response) => response.answer && response.answer.trim().length > 0);
    const responseQualityFlag = validResponses.length < 3 ? "low_response_count" : "normal";

    if (validResponses.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          message: "Not enough valid AI responses"
        } as VerifyApiError,
        { status: 500 }
      );
    }

    const adjustedMode = validResponses.length < 3 && mode === "fast" ? "deep" : mode;
    const failedModelCount = providerFlow.responses.length - validResponses.length;
    const verification = verifyResponses(validResponses, providerFlow.modelSources, safeEvidenceSnippets, adjustedMode, failedModelCount, prompt);
    let warnings: string[] = [];

    if (failedModelCount === 1) {
      warnings.push("One model was temporarily unavailable. Verification is based on remaining models.");
    }

    if (failedModelCount >= 2) {
      warnings.push("Some AI models were temporarily unavailable. Please retry.");
    }



    if (safeEvidenceSnippets.length === 0) {
      warnings.push(
        providerFlow.meta.retrievalModeUsed === "none"
          ? "Evidence retrieval unavailable. SVA used model consensus only."
          : "Live web retrieval returned no evidence for this prompt. Try a more specific query."
      );
    }

    let usage: VerificationUsageSummary = {
      plan: (user?.plan ?? "free") as "free" | "pro" | "plus",
      usedToday: user?.usedToday ?? 0,
      dailyLimit: user?.dailyLimit ?? getDailyLimit("free"),
      creditsRemaining: user?.creditsRemaining ?? 0
    };

    let creditsUsed = 0;
    let creditsRemaining = user?.creditsRemaining ?? 0;
    if (user) {
      const creditResult = (await consumeVerificationCredits(user.userId, mode)) ?? consumeResolvedSessionCredits(user, mode);
      if (!creditResult.ok) {
        return NextResponse.json(
          {
            ok: false,
            message: "Verification limit exceeded. Upgrade your plan or wait for reset."
          } as VerifyApiError,
          { status: 403 }
        );
      }
      creditsUsed = creditResult.creditsUsed;
      creditsRemaining = creditResult.creditsRemaining;

      await appendHistoryForUser(user.userId, {
        prompt,
        mode,
        resultSummary: verification.finalAnswer,
        timestamp: new Date().toISOString(),
        confidence: verification.finalConfidenceScore,
        verdict: verification.judgeVerdict ?? "caution",
        creditsUsed,
        success: true
      });
      await trackEvent("verification_completed", user.userId, {
        mode,
        confidence: verification.finalConfidenceScore,
        verdict: verification.judgeVerdict ?? "caution"
      });

      usage = {
        plan: user.plan,
        usedToday: user.usedToday,
        dailyLimit: getDailyLimit(user.plan),
        creditsRemaining
      };
    }

    const payload: VerifyApiSuccess = {
      ok: true,
      verification,
      responses: validResponses,
      modelSources: providerFlow.modelSources,
      evidenceSnippets: safeEvidenceSnippets,
      meta: {
        ...providerFlow.meta,
        responseQualityFlag
      },
      providerRuntimeStatus: providerFlow.providerRuntimeStatus,
      usage,
      warnings
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
