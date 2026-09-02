import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const shaping = read("lib/response-shaping.ts");
const proLayer = read("lib/providers/pro-layer.ts");
const synthesis = read("lib/providers/synthesis.ts");
const openrouter = read("lib/providers/openrouter.ts");
const verifier = read("lib/verifier.ts");
const verifyRoute = read("app/api/verify/route.ts");
const providerUsage = read("lib/server/provider-usage.ts");
const costProtection = read("lib/server/cost-protection.ts");

const executeTypeScriptModule = (source, requireModule = () => { throw new Error("Unexpected module import"); }) => {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  const factory = vm.runInNewContext(`(function (require, module, exports) { ${compiled}\n})`, { process });
  factory(requireModule, module, module.exports);
  return module.exports;
};

const planModule = executeTypeScriptModule(read("lib/plans.ts"));
const shapingModule = executeTypeScriptModule(shaping, (specifier) => {
  if (specifier === "./plans") return planModule;
  throw new Error(`Unexpected module import: ${specifier}`);
});

test("GPT, Gemini, and DeepSeek paid calls share a defensive 100-token API ceiling", () => {
  for (const family of ["gpt", "gemini", "deepseek"]) assert.match(proLayer, new RegExp(`family: "${family}"`));
  assert.match(shaping, /PAID_COMPARISON_OUTPUT_TOKEN_LIMIT = 100/);
  assert.match(proLayer, /Math\.min\([\s\S]*PAID_COMPARISON_OUTPUT_TOKEN_LIMIT/);
  assert.match(proLayer, /maxTokens,/);
  assert.match(openrouter, /max_tokens: options\.maxTokens/);
  assert.doesNotMatch(openrouter, /max_completion_tokens/);
});

test("paid synthesis has an independent defensive 200-token API ceiling", () => {
  assert.match(shaping, /PAID_SYNTHESIS_OUTPUT_TOKEN_LIMIT = 200/);
  assert.match(synthesis, /input\.plan === "free" \? input\.maxTokens : Math\.min\(input\.maxTokens, PAID_SYNTHESIS_OUTPUT_TOKEN_LIMIT\)/);
  assert.match(synthesis, /maxTokens,/);
  assert.match(synthesis, /attempt: "synthesis"/);
});

test("actual response shaping behavior caps paid plans and preserves Free limits", () => {
  const { boundPaidEvidenceSnippets, resolveResponseShape } = shapingModule;
  const resolve = (plan, prompt) => JSON.parse(JSON.stringify(resolveResponseShape(plan, prompt)));
  const normalPrompt = "Describe the main considerations people should evaluate before choosing between two established approaches for a routine project with ordinary goals and constraints.";
  const complexPrompt = "Explain the security architecture, API behavior, database tradeoffs, and operational risks in this implementation.";

  for (const plan of ["pro", "ultra"]) {
    assert.deepEqual(resolve(plan, normalPrompt), { complexity: "normal", comparisonMaxTokens: 100, synthesisMaxTokens: 200 });
    assert.deepEqual(resolve(plan, complexPrompt), { complexity: "complex", comparisonMaxTokens: 100, synthesisMaxTokens: 200 });
  }

  assert.deepEqual(resolve("free", normalPrompt), { complexity: "normal", comparisonMaxTokens: 160, synthesisMaxTokens: 220 });
  assert.deepEqual(resolve("free", complexPrompt), { complexity: "complex", comparisonMaxTokens: 160, synthesisMaxTokens: 220 });

  const bounded = boundPaidEvidenceSnippets(Array.from({ length: 10 }, (_, index) => ({ title: `source-${index}`, text: "x".repeat(1000) })));
  assert.equal(bounded.length, 8);
  assert.ok(bounded.every((snippet) => snippet.text.length === 800));
});

test("oversized user prompts are rejected and paid evidence context is bounded server-side", () => {
  assert.match(verifyRoute, /estimateTokenCount\(prompt\) > planConfig\.promptTokenLimit/);
  assert.match(verifyRoute, /status: 413/);
  assert.match(verifier, /concisePaidResponse \? boundPaidEvidenceSnippets\(evidenceSnippets\) : evidenceSnippets/);
  assert.match(synthesis, /boundPaidEvidenceSnippets\(input\.evidenceSnippets\)\.slice\(0, 5\)/);
});

test("paid provider prompt requests compact verification content without filler", () => {
  assert.match(verifier, /independent SVA verification model/);
  assert.match(verifier, /direct judgment and essential supporting reason or evidence/);
  assert.match(verifier, /material uncertainty, contradiction, or caveat/);
  assert.match(verifier, /at most 2 short prose sentences and aim for no more than 60 words/);
  assert.match(verifier, /Do not use bullets, numbered lists, headings/);
  assert.match(verifier, /No greeting, introduction, filler/);
});

test("all paid primary and fallback attempts receive the same 100-token ceiling", async () => {
  const calls = [];
  const fallbackModels = new Set(["test/gpt-fallback", "test/gemini-fallback", "test/deepseek-fallback"]);
  const mockedOpenRouter = async (modelId, _prompt, options) => {
    calls.push({ modelId, ...options });
    if (!fallbackModels.has(modelId)) return { ok: false, message: "retry", reason: "provider_error", errorType: "provider_unavailable", providerModelId: modelId };
    return { ok: true, text: "Concise factual result.", providerModelId: modelId, actualModelId: modelId };
  };
  const previous = Object.fromEntries(["SVA_GPT_PRIMARY", "SVA_GPT_FALLBACK", "SVA_GEMINI_PRIMARY", "SVA_GEMINI_FALLBACK", "SVA_DEEPSEEK_PRIMARY", "SVA_DEEPSEEK_FALLBACK"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SVA_GPT_PRIMARY: "test/gpt-primary", SVA_GPT_FALLBACK: "test/gpt-fallback",
    SVA_GEMINI_PRIMARY: "test/gemini-primary", SVA_GEMINI_FALLBACK: "test/gemini-fallback",
    SVA_DEEPSEEK_PRIMARY: "test/deepseek-primary", SVA_DEEPSEEK_FALLBACK: "test/deepseek-fallback"
  });
  try {
    const module = executeTypeScriptModule(proLayer, (specifier) => {
      if (specifier === "../response-shaping") return { PAID_COMPARISON_OUTPUT_TOKEN_LIMIT: 100 };
      if (specifier === "./openrouter") return { callOpenRouter: mockedOpenRouter };
      throw new Error(`Unexpected module import: ${specifier}`);
    });
    await module.buildProLayerResponses({ contextPrompt: "Verify this.", evidenceSnippets: [], retrievalModeUsed: "none", mode: "fast", responseMaxTokens: 400 });
    assert.equal(calls.length, 6);
    assert.ok(calls.every((call) => call.maxTokens === 100));
    assert.equal(calls.filter((call) => call.attempt === "primary").length, 3);
    assert.equal(calls.filter((call) => call.attempt === "fallback").length, 3);
  } finally {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test("paid synthesis primary and retry retain the independent 200-token ceiling", async () => {
  const calls = [];
  const module = executeTypeScriptModule(synthesis, (specifier) => {
    if (specifier === "../response-shaping") return { PAID_SYNTHESIS_OUTPUT_TOKEN_LIMIT: 200, boundPaidEvidenceSnippets: (items) => items };
    if (specifier === "./openrouter") return { callOpenRouter: async (modelId, _prompt, options) => {
      calls.push({ modelId, ...options });
      return calls.length === 1
        ? { ok: true, text: "Truncated", providerModelId: modelId, finishReason: "length" }
        : { ok: true, text: "Complete", providerModelId: modelId, finishReason: "stop" };
    } };
    throw new Error(`Unexpected module import: ${specifier}`);
  });
  const result = await module.synthesizeVerificationAnswer({ prompt: "Question", responses: [], evidenceSnippets: [], verification: {}, plan: "ultra", maxTokens: 550 });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map((call) => [call.attempt, call.maxTokens]), [["synthesis", 200], ["synthesis_retry", 200]]);
});

test("Pro and Ultra remain isolated to bounded paid family model sequences", () => {
  assert.match(proLayer, /SVA_GPT_PRIMARY/);
  assert.match(proLayer, /SVA_GEMINI_PRIMARY/);
  assert.match(proLayer, /SVA_DEEPSEEK_PRIMARY/);
  assert.match(proLayer, /modelSequenceForSlot\(slot\)\.slice\(0, 2\)/);
  assert.doesNotMatch(proLayer, /openrouter\/free/);
  assert.match(verifier, /usesProModelLayer\(plan\)/);
});

test("Free routing remains zero-cost and does not inherit paid token ceilings", () => {
  assert.match(verifier, /modelId === "openrouter\/free" \|\| modelId\.endsWith\(":free"\)/);
  assert.match(verifier, /filter\(isZeroCostOpenRouterModel\)/);
  assert.match(verifier, /layer: "free"/);
  assert.match(shaping, /plan === "free"\s*\? shape/);
  assert.doesNotMatch(openrouter.match(/OPENROUTER_MODELS[\s\S]*?as const/)?.[0] ?? "", /openai\/|deepseek\/deepseek-chat/);
});

test("OpenRouter authoritative usage, cost, token details, and latency are preserved", () => {
  assert.match(openrouter, /data\.usage\?\.cost/);
  assert.match(openrouter, /data\.usage\?\.total_cost/);
  assert.match(openrouter, /data\.usage\?\.prompt_tokens/);
  assert.match(openrouter, /data\.usage\?\.completion_tokens/);
  assert.match(openrouter, /data\.usage\?\.total_tokens/);
  assert.match(openrouter, /completion_tokens_details\?\.reasoning_tokens/);
  assert.match(openrouter, /prompt_tokens_details\?\.cached_tokens/);
  assert.match(openrouter, /latencyMs: Date\.now\(\) - startedAt/);
});

test("each paid fallback and synthesis retry can be stored as its own provider usage row", () => {
  assert.match(proLayer, /attempts\.push\(toUsageAttempt/);
  assert.match(proLayer, /providerUsageAttempts: slotResults\.flatMap/);
  assert.match(synthesis, /toUsageAttempt\(primary, "synthesis"\)/);
  assert.match(synthesis, /toUsageAttempt\(retry, "synthesis_retry"\)/);
  assert.match(providerUsage, /input\.providerUsageAttempts\.map/);
  assert.match(providerUsage, /input\.attempts\?\.length/);
  for (const field of ["prompt_tokens", "completion_tokens", "reasoning_tokens", "cached_tokens", "cost_usd", "latency_ms", "provider_http_status", "provider_error_type"]) {
    assert.match(providerUsage, new RegExp(`${field}:`));
  }
});

test("per-verification cost aggregates all paid families and synthesis attempts", () => {
  assert.match(proLayer, /costUsd: sumAttemptMetric/);
  assert.match(synthesis, /retryStatus\.costUsd = sumAttemptMetric/);
  assert.match(verifyRoute, /providerCostUsd\(\[\.\.\.Object\.values\(providerFlow\.providerRuntimeStatus\), synthesis\.status\]\)/);
  assert.match(costProtection, /statuses\.reduce/);
  assert.match(verifyRoute, /verificationCostUsd: totalProviderCostUsd/);
});

test("provider retries and fallbacks remain bounded", () => {
  assert.match(openrouter, /shouldSingleRetry/);
  assert.match(proLayer, /slice\(0, 2\)/);
  assert.match(synthesis, /const retry = await callOpenRouter/);
  assert.doesNotMatch(synthesis, /while\s*\(|for\s*\(/);
});

test("reservation finalize and failure refund still wrap the optimized pipeline", () => {
  assert.match(verifyRoute, /reserveVerificationAllowance/);
  assert.match(verifyRoute, /if \(validResponses\.length < 2\)[\s\S]*await refundReservation\(\)/);
  assert.match(verifyRoute, /if \(!synthesis\.ok\)[\s\S]*await refundReservation\(\)/);
  assert.match(verifyRoute, /finalizeVerificationReservation\(reservation\)/);
  assert.match(verifyRoute, /catch \(error\)[\s\S]*await refundReservation\(\)/);
});
