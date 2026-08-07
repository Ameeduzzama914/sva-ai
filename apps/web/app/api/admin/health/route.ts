import { NextResponse } from "next/server";
import type { AdminHealthPayload, AdminHealthStatus } from "../../../../lib/admin-types";
import { checkOpenRouterHealth } from "../../../../lib/server/openrouter-health";
import { requireAdminSession } from "../../../../lib/server/admin-auth";

const statusFromConfigured = (configured: boolean): AdminHealthStatus =>
  configured ? "healthy" : "issue";

const pendingIfPartial = (configured: boolean, relatedConfigured: boolean): AdminHealthStatus => {
  if (configured) return "healthy";
  return relatedConfigured ? "pending" : "issue";
};

export async function GET(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin.ok) return admin.response;

  const openRouterHealth = await checkOpenRouterHealth();
  const openrouter = Boolean(process.env.OPENROUTER_API_KEY);
  const retrieval = Boolean(
    process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY || process.env.WEB_RETRIEVAL_API_KEY
  );
  const gpt = Boolean(process.env.SVA_GPT_PRIMARY || process.env.PRO_OPENROUTER_MODEL_A);
  const gemini = Boolean(process.env.SVA_GEMINI_PRIMARY || process.env.PRO_OPENROUTER_MODEL_B);
  const deepseek = Boolean(process.env.SVA_DEEPSEEK_PRIMARY || process.env.PRO_OPENROUTER_MODEL_C);
  const hasAnyAiKey = openrouter;

  const balanceStatus: AdminHealthStatus =
    openRouterHealth.status === "critical" || openRouterHealth.status === "not_configured"
      ? "issue"
      : openRouterHealth.status === "warning" || openRouterHealth.status === "unknown"
        ? "pending"
        : "healthy";

  const health: AdminHealthPayload = {
    dataSource: "live",
    openRouter: openRouterHealth,
    providers: [
      {
        name: "OpenRouter Central Account",
        status: balanceStatus,
        detail: openRouterHealth.message
      },
      {
        name: "Retrieval",
        status: statusFromConfigured(retrieval),
        detail: retrieval ? "Retrieval key configured" : "Retrieval API key missing"
      },
      {
        name: "GPT",
        status: pendingIfPartial(openrouter && gpt, hasAnyAiKey),
        detail: openrouter ? "Routed through SVA central OpenRouter account" : "Depends on OPENROUTER_API_KEY"
      },
      {
        name: "Gemini",
        status: pendingIfPartial(openrouter && gemini, hasAnyAiKey),
        detail: openrouter ? "Routed through SVA central OpenRouter account" : "Depends on OPENROUTER_API_KEY"
      },
      {
        name: "DeepSeek",
        status: pendingIfPartial(openrouter && deepseek, hasAnyAiKey),
        detail: openrouter ? "Routed through SVA central OpenRouter account" : "Depends on OPENROUTER_API_KEY"
      }
    ]
  };

  return NextResponse.json({ ok: true, health });
}
