import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const dashboard = readFileSync(join(process.cwd(), "components/saas-dashboard.tsx"), "utf8");

test("idle dashboard hides result sections until a verification is attempted", () => {
  assert.match(dashboard, /const hasRunVerification = responses\.length > 0 \|\| verification !== null \|\| errorMessage !== null \|\| isLoading/);
  assert.match(dashboard, /\{hasRunVerification \? \([\s\S]*?<VerificationPipeline[\s\S]*?<ModelAgreementSection[\s\S]*?<VerifiedAnswerCard[\s\S]*?\) : null\}/);
  assert.doesNotMatch(dashboard, /Question submitted/);
});

test("attempt and error states still qualify as non-idle", () => {
  assert.match(dashboard, /errorMessage !== null \|\| isLoading/);
  assert.match(dashboard, /setIsLoading\(true\);[\s\S]*clearResultState\(\);[\s\S]*fetch\("\/api\/verify"/);
  assert.match(dashboard, /setErrorMessage\(data\.ok \? "Verification failed\." : data\.message\)/);
});

test("evidence and claims retain their grid widths but align to natural top heights", () => {
  assert.match(dashboard, /grid items-start gap-5 xl:grid-cols-\[minmax\(0,1\.1fr\)_minmax\(0,0\.9fr\)\]/);
  assert.match(dashboard, /<EvidencePanel[\s\S]*?<ClaimsPanel/);
});
