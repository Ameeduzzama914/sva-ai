import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const claimsSource = readFileSync(join(root, "lib/claims.ts"), "utf8");
const verifierSource = readFileSync(join(root, "lib/verifier.ts"), "utf8");
const verifyRoute = readFileSync(join(root, "app/api/verify/route.ts"), "utf8");

const compiled = ts.transpileModule(claimsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const module = { exports: {} };
vm.runInNewContext(`(function (module, exports) { ${compiled}\n})`)(module, module.exports);
const { extractAnswerClaims } = module.exports;

test("extracts a short factual claim from the synthesized answer", () => {
  assert.deepEqual(Array.from(extractAnswerClaims("Reykjavík is the capital of Iceland.")), ["Reykjavík is the capital of Iceland."]);
});

test("splits a compound capital and largest-city statement into atomic claims", () => {
  assert.deepEqual(Array.from(extractAnswerClaims("Reykjavík is the capital and largest city of Iceland.")), [
    "Reykjavík is the capital of Iceland.",
    "Reykjavík is the largest city of Iceland."
  ]);
});

test("resolves pronouns and preserves distinct factual propositions", () => {
  assert.deepEqual(Array.from(extractAnswerClaims("The capital of Iceland is Reykjavík. It is the largest city and the world's northernmost capital of a sovereign state.")), [
    "Reykjavík is the capital of Iceland.",
    "Reykjavík is the largest city of Iceland.",
    "Reykjavík is the world's northernmost capital of a sovereign state."
  ]);
});

test("rejects source metadata, URLs, scores, and methodology commentary", () => {
  const text = `Welcome to the Heart of Iceland\nhttps://visitreykjavik.is\nSource quality is 82%.\nEvidence Summary\nAreas with sparse or lower-authority evidence reduce certainty.`;
  assert.deepEqual(Array.from(extractAnswerClaims(text)), []);
});

test("deduplicates paraphrased answer claims", () => {
  const extracted = Array.from(extractAnswerClaims("Reykjavík is the capital of Iceland. The capital of Iceland is Reykjavík."));
  assert.equal(extracted.length, 1);
  assert.match(extracted[0], /Reykjavík.*capital.*Iceland/i);
});

test("successful synthesis refreshes user-facing claims without another provider call", () => {
  assert.match(verifyRoute, /applySynthesisAnswer\(verification, synthesis\.answer\);[\s\S]*refreshClaimVerificationsFromAnswer\(verification, synthesis\.answer, validResponses, safeEvidenceSnippets\)/);
  assert.match(verifierSource, /refreshClaimVerificationsFromAnswer[\s\S]*const answerClaims = extractAnswerClaims\(finalAnswer\)/);
  assert.match(verifierSource, /responses\.flatMap\(\(response\) => extractAnswerClaims\(response\.answer, 4\)\)/);
  assert.match(verifierSource, /verifyClaimCandidates\(clusterClaims\(extractClaims\(finalAnswer\)\)/);
  assert.doesNotMatch(claimsSource, /fetch\(|callOpenRouter|retrieve\(/);
});
