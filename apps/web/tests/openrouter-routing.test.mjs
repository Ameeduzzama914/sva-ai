import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const verifier = read("lib/verifier.ts");
const openrouter = read("lib/providers/openrouter.ts");
const proLayer = read("lib/providers/pro-layer.ts");

test("Free-plan OpenRouter routing only attempts zero-cost models and falls back to openrouter/free", () => {
  assert.match(openrouter, /OPENROUTER_MODEL_A/);
  assert.match(openrouter, /mistralai\/mistral-7b-instruct:free/);
  assert.match(openrouter, /OPENROUTER_MODEL_B/);
  assert.match(openrouter, /meta-llama\/llama-3\.1-8b-instruct:free/);
  assert.match(openrouter, /OPENROUTER_MODEL_C/);
  assert.match(openrouter, /google\/gemma-7b-it:free/);
  assert.match(openrouter, /openrouter\/free/);

  assert.match(verifier, /isZeroCostOpenRouterModel/);
  assert.match(verifier, /modelId === "openrouter\/free" \|\| modelId\.endsWith\(":free"\)/);
  assert.match(verifier, /free model config ignored because it is not a zero-cost model/);
  assert.match(verifier, /filter\(isZeroCostOpenRouterModel\)/);
  assert.match(verifier, /new Set\(/);
  assert.match(verifier, /attempt = modelId === "openrouter\/free" \? "router_fallback"/);
  assert.match(verifier, /layer: "free"/);
});

test("Paid Pro and Ultra routing remains on configured paid families without openrouter/free degradation", () => {
  assert.match(proLayer, /SVA_GPT_PRIMARY/);
  assert.match(proLayer, /SVA_GEMINI_PRIMARY/);
  assert.match(proLayer, /SVA_DEEPSEEK_PRIMARY/);
  assert.match(proLayer, /PRO_OPENROUTER_MODEL_A/);
  assert.match(proLayer, /PRO_OPENROUTER_MODEL_B/);
  assert.match(proLayer, /PRO_OPENROUTER_MODEL_C/);
  assert.match(proLayer, /layer: "pro"/);
  assert.match(proLayer, /attempt: index > 0 \? "fallback" : "primary"/);
  assert.doesNotMatch(proLayer, /openrouter\/free/);
});

test("OpenRouter attempt logging records actual routing, model, cost, and status metadata", () => {
  assert.match(openrouter, /const logOpenRouterAttempt/);
  assert.match(openrouter, /request started/);
  assert.match(openrouter, /request succeeded/);
  assert.match(openrouter, /requestedModelId: modelId/);
  assert.match(openrouter, /actualModelId: success\.actualModelId/);
  assert.match(openrouter, /costUsd: success\.costUsd/);
  assert.match(openrouter, /promptTokens: success\.promptTokens/);
  assert.match(openrouter, /completionTokens: success\.completionTokens/);
  assert.match(openrouter, /finishReason: success\.finishReason/);
  assert.match(openrouter, /errorType/);
  assert.match(openrouter, /statusCode: response\.status/);
});