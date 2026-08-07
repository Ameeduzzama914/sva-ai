import { createAdminAlert } from "./admin-alerts";

export type OpenRouterBalanceStatus = "not_configured" | "healthy" | "warning" | "critical" | "unknown";

export type OpenRouterHealth = {
  configured: boolean;
  managementConfigured: boolean;
  keyValid: boolean | null;
  balanceUsd: number | null;
  warningThresholdUsd: number | null;
  criticalThresholdUsd: number | null;
  status: OpenRouterBalanceStatus;
  message: string;
  checkedAt: string;
};

const parseMoneyEnv = (name: string): number | null => {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const pickBalance = (payload: unknown): number | null => {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
  const candidates = [data.total_credits, data.totalCredits, data.credits, data.balance, data.remaining, data.limit_remaining];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim() && !Number.isNaN(Number(candidate))) return Number(candidate);
  }
  return null;
};

const classifyBalance = (balanceUsd: number | null, warning: number | null, critical: number | null): OpenRouterBalanceStatus => {
  if (balanceUsd === null) return "unknown";
  if (critical !== null && balanceUsd <= critical) return "critical";
  if (warning !== null && balanceUsd <= warning) return "warning";
  return "healthy";
};

export const classifyOpenRouterProviderFailure = (statusCode?: number, providerError?: string): "billing_failure" | "configuration_failure" | "rate_limited" | "provider_unavailable" | "provider_error" => {
  const text = providerError?.toLowerCase() ?? "";
  if (statusCode === 402 || /insufficient|credit|credits|balance|budget|quota exhausted|exhausted/.test(text)) return "billing_failure";
  if (statusCode === 401 || /api key|auth|unauthorized/.test(text)) return "configuration_failure";
  if (statusCode === 429) return "rate_limited";
  if (statusCode === 408 || statusCode === 502 || statusCode === 503 || statusCode === 504) return "provider_unavailable";
  return "provider_error";
};

export const checkOpenRouterHealth = async (): Promise<OpenRouterHealth> => {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const managementKey = process.env.OPENROUTER_MANAGEMENT_KEY?.trim();
  const warningThresholdUsd = parseMoneyEnv("OPENROUTER_WARNING_BALANCE_USD");
  const criticalThresholdUsd = parseMoneyEnv("OPENROUTER_CRITICAL_BALANCE_USD");
  const checkedAt = new Date().toISOString();

  if (!apiKey) {
    await createAdminAlert({ alertType: "openrouter_key_missing", severity: "critical", source: "openrouter", message: "OPENROUTER_API_KEY is missing. Verified Mode cannot call the central OpenRouter account." });
    return { configured: false, managementConfigured: false, keyValid: false, balanceUsd: null, warningThresholdUsd, criticalThresholdUsd, status: "not_configured", message: "OPENROUTER_API_KEY missing", checkedAt };
  }

  if (!managementKey) {
    return { configured: true, managementConfigured: false, keyValid: null, balanceUsd: null, warningThresholdUsd, criticalThresholdUsd, status: "unknown", message: "OPENROUTER_MANAGEMENT_KEY not configured; balance check skipped.", checkedAt };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${managementKey}` },
      cache: "no-store"
    });
    const payload = (await response.json().catch(() => null)) as unknown;

    if (response.status === 401 || response.status === 403) {
      await createAdminAlert({ alertType: "openrouter_management_key_invalid", severity: "critical", source: "openrouter", message: "OpenRouter management/balance check failed authorization." });
      return { configured: true, managementConfigured: true, keyValid: false, balanceUsd: null, warningThresholdUsd, criticalThresholdUsd, status: "critical", message: "OpenRouter management key is invalid or unauthorized.", checkedAt };
    }

    if (!response.ok) {
      return { configured: true, managementConfigured: true, keyValid: null, balanceUsd: null, warningThresholdUsd, criticalThresholdUsd, status: "unknown", message: `OpenRouter balance check returned HTTP ${response.status}.`, checkedAt };
    }

    const balanceUsd = pickBalance(payload);
    const status = classifyBalance(balanceUsd, warningThresholdUsd, criticalThresholdUsd);
    if (status === "warning" || status === "critical") {
      await createAdminAlert({
        alertType: status === "critical" ? "openrouter_balance_critical" : "openrouter_balance_warning",
        severity: status,
        source: "openrouter",
        message: status === "critical" ? "OpenRouter central balance is at or below the critical threshold." : "OpenRouter central balance is at or below the warning threshold.",
        metadata: { balanceUsd, warningThresholdUsd, criticalThresholdUsd }
      });
    }

    return {
      configured: true,
      managementConfigured: true,
      keyValid: true,
      balanceUsd,
      warningThresholdUsd,
      criticalThresholdUsd,
      status,
      message: balanceUsd === null ? "OpenRouter key is valid; balance was not present in the response." : `OpenRouter central balance: $${balanceUsd.toFixed(2)}.`,
      checkedAt
    };
  } catch (error) {
    return { configured: true, managementConfigured: true, keyValid: null, balanceUsd: null, warningThresholdUsd, criticalThresholdUsd, status: "unknown", message: error instanceof Error ? error.message : "OpenRouter balance check failed.", checkedAt };
  }
};

export const createOpenRouterBillingFailureAlert = async (input: { statusCode?: number; providerModelId?: string; providerError?: string }) => {
  await createAdminAlert({
    alertType: "openrouter_billing_failure",
    severity: "critical",
    source: "openrouter",
    message: "OpenRouter returned an insufficient-credit or exhausted-budget response. Customer allowance was not used.",
    metadata: {
      statusCode: input.statusCode ?? null,
      providerModelId: input.providerModelId ?? null,
      providerError: input.providerError ? input.providerError.slice(0, 240) : null
    }
  });
};

