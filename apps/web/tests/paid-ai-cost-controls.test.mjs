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
  const factory = vm.runInNewContext(`(function (require, module, exports) { ${compiled}\n})`);
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
  const { resolveResponseShape } = shapingModule;
  const resolve = (plan, prompt) => JSON.parse(JSON.stringify(resolveResponseShape(plan, prompt)));
  const normalPrompt = "Describe the main considerations people should evaluate before choosing between two established approaches for a routine project with ordinary goals and constraints.";
  const complexPrompt = "Explain the security architecture, API behavior, database tradeoffs, and operational risks in this implementation.";

  for (const plan of ["pro", "ultra"]) {
    assert.deepEqual(resolve(plan, normalPrompt), { complexity: "normal", comparisonMaxTokens: 100, synthesisMaxTokens: 200 });
    assert.deepEqual(resolve(plan, complexPrompt), { complexity: "complex", comparisonMaxTokens: 100, synthesisMaxTokens: 200 });
  }

  assert.deepEqual(resolve("free", normalPrompt), { complexity: "normal", comparisonMaxTokens: 160, synthesisMaxTokens: 220 });
  assert.deepEqual(resolve("free", complexPrompt), { complexity: "complex", comparisonMaxTokens: 160, synthesisMaxTokens: 220 });
});

test("paid provider prompt requests compact verification content without filler", () => {
  assert.match(verifier, /independent SVA verification model/);
  assert.match(verifier, /direct judgment and essential supporting reason or evidence/);
  assert.match(verifier, /material uncertainty, contradiction, or caveat/);
  assert.match(verifier, /1-2 concise sentences when sufficient/);
  assert.match(verifier, /No greeting, introduction, filler/);
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
