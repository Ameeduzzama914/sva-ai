import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { type VerificationMode, type VerifyApiError, type VerifyApiSuccess } from "../../../lib/models";
import { getSvaPlan } from "../../../lib/plans";
import { resolveResponseShape } from "../../../lib/response-shaping";
import { getAuthenticatedUser } from "../../../lib/server/auth";
import { insertProviderUsageRows, insertSynthesisProviderUsageRow } from "../../../lib/server/provider-usage";
import { createOpenRouterBillingFailureAlert } from "../../../lib/server/openrouter-health";
import { evaluateProfitProtection, providerCostUsd } from "../../../lib/server/cost-protection";
import { insertSupabaseVerificationLog } from "../../../lib/server/supabase-usage";
import {
  appendHistoryForUser,
  getVerificationCreditCost,
  trackEvent
} from "../../../lib/server/store";
import {
  finalizeVerificationReservation,
  refundVerificationReservation,
  reserveVerificationAllowance,
  type VerificationReservation
} from "../../../lib/server/verification-reservations";
import { applySynthesisAnswer, synthesizeVerificationAnswer } from "../../../lib/providers/synthesis";
import { buildResponsesForPrompt, refreshClaimVerificationsFromAnswer, verifyResponses } from "../../../lib/verifier";

interface VerifyRequestBody {
  prompt?: string;
}

const withTimeout = async <T>(promise: Promise<T>, ms = 35000): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Verification timed out.")), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const hasOpenRouterBillingFailure = (providerFlow: Awaited<ReturnType<typeof buildResponsesForPrompt>>): boolean =>
  Object.values(providerFlow.providerRuntimeStatus).some(
    (status) => status.statusCode === 402 || status.providerErrorType === "billing_failure" || /credit|balance|budget|exhausted/i.test(status.errorMessage ?? "")
  );

const estimateTokenCount = (text: string): number => Math.ceil(text.trim().split(/\s+/).filter(Boolean).join(" ").length / 4);

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ ok: false, message: "Please login first." } as VerifyApiError, { status: 401 });
  }

  let body: VerifyRequestBody;
  try {
    body = (await request.json()) as VerifyRequestBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body. Please send valid JSON with a prompt field." } as VerifyApiError, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  const mode: VerificationMode = "deep";

  if (!prompt) {
    return NextResponse.json({ ok: false, message: "Please enter a prompt before verification." } as VerifyApiError, { status: 400 });
  }

  const planConfig = getSvaPlan(user.plan);
  if (estimateTokenCount(prompt) > planConfig.promptTokenLimit) {
    return NextResponse.json(
      { ok: false, message: `Your prompt is too long for ${planConfig.label}. Please keep it within ${planConfig.promptTokenLimit} tokens.` } as VerifyApiError,
      { status: 413 }
    );
  }

  const creditsUsed = getVerificationCreditCost(mode);
  const verificationId = randomUUID();
  const idempotencyKey = `${user.userId}:${verificationId}`;
  let reservation: VerificationReservation | null = null;

  const refundReservation = async () => {
    if (reservation) {
      await refundVerificationReservation(reservation, creditsUsed);
      reservation = null;
    }
  };

  try {
    await trackEvent("verification_started", user.userId, { mode: "verified", verificationId });

    const reserved = await reserveVerificationAllowance({
      userId: user.userId,
      plan: user.plan,
      verificationId,
      idempotencyKey,
      creditsUsed,
      metadata: { source: "api.verify", mode: "verified" }
    });

    if (!reserved.ok) {
      return NextResponse.json({ ok: false, message: reserved.message } as VerifyApiError, { status: reserved.status });
    }

    reservation = reserved.reservation;
    const usage = reservation.usage;
    const responseShape = resolveResponseShape(usage.plan, prompt);
    const providerFlow = await withTimeout(buildResponsesForPrompt(prompt, mode, usage.plan, responseShape.comparisonMaxTokens), 35000);
    const safeEvidenceSnippets = providerFlow.evidenceSnippets;
    const validResponses = providerFlow.responses.filter((response) => response.answer && response.answer.trim().length > 0);
    const responseQualityFlag = validResponses.length < 3 ? "low_response_count" : "normal";

    await insertProviderUsageRows({
      verificationId,
      userId: user.userId,
      plan: usage.plan,
      providerRuntimeStatus: providerFlow.providerRuntimeStatus,
      providerUsageAttempts: providerFlow.providerUsageAttempts
    });

    if (hasOpenRouterBillingFailure(providerFlow)) {
      const firstBillingFailure = Object.values(providerFlow.providerRuntimeStatus).find(
        (status) => status.statusCode === 402 || status.providerErrorType === "billing_failure"
      );
      await refundReservation();
      await createOpenRouterBillingFailureAlert({
        statusCode: firstBillingFailure?.statusCode,
        providerModelId: firstBillingFailure?.providerModelId,
        providerError: firstBillingFailure?.errorMessage
      });
      return NextResponse.json(
        { ok: false, message: "Verification is temporarily unavailable. Your allowance was not used. Please try again." } as VerifyApiError,
        { status: 503 }
      );
    }

    if (validResponses.length < 2) {
      await refundReservation();
      return NextResponse.json(
        { ok: false, message: "Verification is temporarily unavailable. Your allowance was not used. Please try again." } as VerifyApiError,
        { status: 503 }
      );
    }

    const failedModelCount = providerFlow.responses.length - validResponses.length;
    let verification = verifyResponses(validResponses, providerFlow.modelSources, safeEvidenceSnippets, mode, failedModelCount, prompt);
    const synthesis = await withTimeout(
      synthesizeVerificationAnswer({
        prompt,
        responses: validResponses,
        evidenceSnippets: safeEvidenceSnippets,
        verification,
        plan: usage.plan,
        maxTokens: responseShape.synthesisMaxTokens
      }),
      35000
    );
    await insertSynthesisProviderUsageRow({ verificationId, userId: user.userId, plan: usage.plan, status: synthesis.status, attempts: synthesis.attempts });
    if (!synthesis.ok) {
      await refundReservation();
      return NextResponse.json(
        { ok: false, message: "Verification is temporarily unavailable. Your allowance was not used. Please try again." } as VerifyApiError,
        { status: 503 }
      );
    }
    verification = applySynthesisAnswer(verification, synthesis.answer);
    verification = refreshClaimVerificationsFromAnswer(verification, synthesis.answer, validResponses, safeEvidenceSnippets);
    const warnings: string[] = [];

    if (failedModelCount === 1) warnings.push("Two independent model families completed this verification. One provider was temporarily unavailable.");
    if (safeEvidenceSnippets.length === 0) {
      warnings.push(
        providerFlow.meta.retrievalModeUsed === "none"
          ? "Evidence analysis unavailable for this verification. SVA used model consensus only."
          : "Live web retrieval returned no evidence for this prompt. Try a more specific query."
      );
    }

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
    await insertSupabaseVerificationLog({
      userId: user.userId,
      email: user.email,
      query: prompt,
      mode,
      confidence: verification.finalConfidenceScore,
      verdict: verification.judgeVerdict ?? "caution",
      plan: usage.plan,
      status: "completed"
    });
    const totalProviderCostUsd = providerCostUsd([...Object.values(providerFlow.providerRuntimeStatus), synthesis.status]);
    await evaluateProfitProtection({
      userId: user.userId,
      plan: usage.plan,
      verificationId,
      verificationCostUsd: totalProviderCostUsd,
      complexity: responseShape.complexity
    });
    await finalizeVerificationReservation(reservation);
    reservation = null;
    await trackEvent("verification_completed", user.userId, {
      mode: "verified",
      verificationId,
      confidence: verification.finalConfidenceScore,
      verdict: verification.judgeVerdict ?? "caution"
    });

    const payload: VerifyApiSuccess = {
      ok: true,
      verification,
      responses: validResponses,
      modelSources: providerFlow.modelSources,
      evidenceSnippets: safeEvidenceSnippets,
      meta: {
        ...providerFlow.meta,
        responseQualityFlag,
        complexity: responseShape.complexity,
        comparisonMaxTokens: responseShape.comparisonMaxTokens,
        synthesisMaxTokens: responseShape.synthesisMaxTokens,
        synthesisRetryCount: synthesis.status.retryCount,
        synthesisTruncated: synthesis.status.truncated
      },
      providerRuntimeStatus: providerFlow.providerRuntimeStatus,
      usage,
      warnings
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    await refundReservation();
    console.error("Verification pipeline failed.", {
      message: error instanceof Error ? error.message : "Unknown error"
    });

    return NextResponse.json(
      { ok: false, message: "Verification is temporarily unavailable. Your allowance was not used. Please try again." } as VerifyApiError,
      { status: 500 }
    );
  }
}




