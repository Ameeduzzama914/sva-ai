import type { ModelName } from "../models";

export type OpenRouterModelConfig = { name: ModelName; id: string };
export const OPENROUTER_MODELS: OpenRouterModelConfig[] = [
  { name: "GPT", id: process.env.OPENROUTER_MODEL_A || "openrouter/free" },
  { name: "Gemini", id: process.env.OPENROUTER_MODEL_B || "openrouter/free" },
  { name: "DeepSeek", id: process.env.OPENROUTER_MODEL_C || "openrouter/free" }
];

export async function callOpenRouter(modelId: string, prompt: string): Promise<{ok:true;text:string;providerModelId:string;}|{ok:false;message:string;reason:"not_configured"|"request_failed"|"parse_failed";statusCode?:number;providerModelId:string;}> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok:false, message:"OpenRouter API key not configured. Add OPENROUTER_API_KEY in Vercel to enable live AI answers.", reason:"not_configured", providerModelId:modelId };
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 25000);
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", { method:"POST", headers:{"Content-Type":"application/json", "Authorization":`Bearer ${apiKey}`, "HTTP-Referer":process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000", "X-OpenRouter-Title":"SVA - Super Verified AI"}, body: JSON.stringify({ model:modelId, messages:[{role:"system",content:"You are one of the independent AI models inside SVA. Answer the user's question directly, clearly, and honestly. If uncertain, say so. Do not mention SVA unless asked."},{role:"user",content:prompt}], temperature:0.2, max_tokens:500 }), signal:controller.signal }).finally(()=>clearTimeout(t));
    if (!res.ok) return {ok:false,message:`OpenRouter request failed (${res.status}).`,reason:"request_failed",statusCode:res.status,providerModelId:modelId};
    const data = await res.json() as {choices?:Array<{message?:{content?:string}}>};
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return {ok:false,message:"OpenRouter response parse failed.",reason:"parse_failed",providerModelId:modelId};
    return {ok:true,text,providerModelId:modelId};
  } catch { return {ok:false,message:"OpenRouter request failed.",reason:"request_failed",providerModelId:modelId}; }
}
