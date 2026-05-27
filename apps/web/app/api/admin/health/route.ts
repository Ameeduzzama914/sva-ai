import { NextResponse } from "next/server";
import type { AdminHealthPayload, AdminHealthStatus } from "../../../../lib/admin-types";
import { requireAdminSession } from "../../../../lib/server/admin-auth";

const statusFromConfigured = (configured: boolean): AdminHealthStatus =>
  configured ? "healthy" : "issue";

const pendingIfPartial = (configured: boolean, relatedConfigured: boolean): AdminHealthStatus => {
  if (configured) {
    return "healthy";
  }
  return relatedConfigured ? "pending" : "issue";
};

export async function GET(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin.ok) {
    return admin.response;
  }

  const openrouter = Boolean(process.env.OPENROUTER_API_KEY);
  const retrieval = Boolean(
    process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY || process.env.WEB_RETRIEVAL_API_KEY
  );
  const openai = Boolean(process.env.OPENAI_API_KEY);
  const gemini = Boolean(process.env.GEMINI_API_KEY);
  const deepseek = Boolean(process.env.DEEPSEEK_API_KEY);
  const hasAnyAiKey = openrouter || openai || gemini || deepseek;

  const health: AdminHealthPayload = {
    dataSource: "live",
    providers: [
      {
        name: "OpenRouter",
        status: statusFromConfigured(openrouter),
        detail: openrouter ? "API key configured" : "OPENROUTER_API_KEY missing"
      },
      {
        name: "Retrieval",
        status: statusFromConfigured(retrieval),
        detail: retrieval ? "Retrieval key configured" : "Retrieval API key missing"
      },
      {
        name: "Mistral",
        status: pendingIfPartial(openrouter, hasAnyAiKey),
        detail: openrouter ? "Routed via OpenRouter free layer" : "Depends on OpenRouter"
      },
      {
        name: "Llama",
        status: pendingIfPartial(openrouter, hasAnyAiKey),
        detail: openrouter ? "Routed via OpenRouter free layer" : "Depends on OpenRouter"
      },
      {
        name: "Gemma",
        status: pendingIfPartial(openrouter, hasAnyAiKey),
        detail: openrouter ? "Routed via OpenRouter free layer" : "Depends on OpenRouter"
      },
      {
        name: "GPT",
        status: statusFromConfigured(openai),
        detail: openai ? "OPENAI_API_KEY configured" : "OPENAI_API_KEY missing"
      },
      {
        name: "Gemini",
        status: statusFromConfigured(gemini),
        detail: gemini ? "GEMINI_API_KEY configured" : "GEMINI_API_KEY missing"
      },
      {
        name: "DeepSeek",
        status: statusFromConfigured(deepseek),
        detail: deepseek ? "DEEPSEEK_API_KEY configured" : "DEEPSEEK_API_KEY missing"
      }
    ]
  };

  return NextResponse.json({ ok: true, health });
}
