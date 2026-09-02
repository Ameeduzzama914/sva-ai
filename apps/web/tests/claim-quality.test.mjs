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

test("decomposes relational appositives and trailing participles", () => {
  assert.deepEqual(Array.from(extractAnswerClaims("The capital of Iceland is Reykjavík, the largest city and the world's northernmost national capital, located in southwest Iceland.")), [
    "Reykjavík is the capital of Iceland.",
    "Reykjavík is the largest city in Iceland.",
    "Reykjavík is the world's northernmost national capital.",
    "Reykjavík is located in southwest Iceland."
  ]);
});

test("splits shared copular predicates without domain-specific rules", () => {
  assert.deepEqual(Array.from(extractAnswerClaims("Reykjavík is the capital and largest city of Iceland.")), [
    "Reykjavík is the capital of Iceland.",
    "Reykjavík is the largest city of Iceland."
  ]);
});

test("splits explicit coordinated finance predicates and preserves shared dates", () => {
  assert.deepEqual(Array.from(extractAnswerClaims("Revenue increased 20% and operating expenses fell 5% in 2025.")), [
    "Revenue increased 20% in 2025.",
    "operating expenses fell 5% in 2025."
  ]);
});

test("splits energy predicates without splitting predicate objects", () => {
  assert.deepEqual(Array.from(extractAnswerClaims("Solar power has low operating costs but depends on sunlight and may require batteries.")), [
    "Solar power has low operating costs.",
    "Solar power depends on sunlight.",
    "Solar power may require batteries."
  ]);
});

test("preserves health modals, qualifiers, and negation", () => {
  assert.deepEqual(Array.from(extractAnswerClaims("Aspirin can reduce fever but may increase bleeding risk in some patients.")), [
    "Aspirin can reduce fever.",
    "Aspirin may increase bleeding risk in some patients."
  ]);
  assert.deepEqual(Array.from(extractAnswerClaims("The treatment does not cure the disease but may reduce symptoms.")), [
    "The treatment does not cure the disease.",
    "The treatment may reduce symptoms."
  ]);
});

test("strips only structurally marked verification commentary", () => {
  assert.deepEqual(Array.from(extractAnswerClaims(`Solar power can reduce electricity costs for a small business: Verified.
It depends on sunlight: Supported.
May require batteries for reliability: Partially verified.
Solar power has a higher upfront cost than grid electricity alone: Mixed evidence.`)), [
    "Solar power can reduce electricity costs for a small business.",
    "Solar power depends on sunlight.",
    "Solar power may require batteries for reliability.",
    "Solar power has a higher upfront cost than grid electricity alone."
  ]);
  assert.deepEqual(Array.from(extractAnswerClaims("The identity remains unverified.")), ["The identity remains unverified."]);
});

test("excludes standalone status labels and safely handles summary markers", () => {
  assert.deepEqual(Array.from(extractAnswerClaims("Verified. Partially verified. Unsupported. Disputed. Inconclusive.")), []);
  assert.deepEqual(Array.from(extractAnswerClaims("In summary: The treatment may reduce symptoms.")), ["The treatment may reduce symptoms."]);
});

test("does not manufacture claims from uncertain subordinate gerund fragments", () => {
  const claims = Array.from(extractAnswerClaims("Solar energy relies on sunlight, making output variable based on weather and daylight availability."));
  assert.deepEqual(claims, ["Solar energy relies on sunlight."]);
  assert.ok(claims.every((claim) => !/\bis making\b|\bis daylight availability\b/i.test(claim)));
});

test("splits technology predicates and relative clauses", () => {
  assert.deepEqual(Array.from(extractAnswerClaims("Bitcoin launched in 2009 and uses a decentralized network.")), [
    "Bitcoin launched in 2009.",
    "Bitcoin uses a decentralized network."
  ]);
  assert.deepEqual(Array.from(extractAnswerClaims("Company X, which was founded in 2010, operates in 12 countries.")), [
    "Company X was founded in 2010.",
    "Company X operates in 12 countries."
  ]);
});

test("does not split subject or object conjunctions", () => {
  assert.deepEqual(Array.from(extractAnswerClaims("Research and development spending increased.")), ["Research and development spending increased."]);
  assert.deepEqual(Array.from(extractAnswerClaims("The company sells phones and tablets.")), ["The company sells phones and tablets."]);
});

test("preserves numeric relationships, currency, units, and dates", () => {
  assert.deepEqual(Array.from(extractAnswerClaims("Revenue grew 12% to $5 million in 2025.")), ["Revenue grew 12% to $5 million in 2025."]);
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

test("keeps at most eight user-facing claims", () => {
  const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet"];
  const answer = names.map((name, index) => `${name} equipment costs ${index + 1} dollars.`).join(" ");
  assert.equal(extractAnswerClaims(answer).length, 8);
});

test("successful synthesis refreshes user-facing claims without another provider call", () => {
  assert.match(verifyRoute, /applySynthesisAnswer\(verification, synthesis\.answer\);[\s\S]*refreshClaimVerificationsFromAnswer\(verification, synthesis\.answer, validResponses, safeEvidenceSnippets\)/);
  assert.match(verifierSource, /refreshClaimVerificationsFromAnswer[\s\S]*const answerClaims = extractAnswerClaims\(finalAnswer\)/);
  assert.match(verifierSource, /responses\.flatMap\(\(response\) => extractAnswerClaims\(response\.answer, 4\)\)/);
  assert.match(verifierSource, /verifyClaimCandidates\(clusterClaims\(extractClaims\(finalAnswer\)\)/);
  assert.doesNotMatch(claimsSource, /fetch\(|callOpenRouter|retrieve\(/);
});
