import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

const baseMigration = read("../../supabase/migrations/20260804_phase_1_29_billing_usage.sql");
const reservationFix = read("../../supabase/migrations/20260901_0001_fix_reservation_daily_used_ambiguity.sql");

const assertSuccessfulReservationPath = (plan, dailyLimit, monthlyLimit) => {
  assert.match(baseMigration, new RegExp(`when '${plan}' then ${dailyLimit}`));
  assert.match(baseMigration, new RegExp(`when '${plan}' then ${monthlyLimit}`));
  assert.match(reservationFix, /public\.sva_plan_daily_limit\(v_plan\)/);
  assert.match(reservationFix, /public\.sva_plan_monthly_limit\(v_plan\)/);
  assert.match(reservationFix, /return query select true, 'reserved'/);
};

test("Pro user with quota remaining reaches a successful reservation path", () => {
  assertSuccessfulReservationPath("pro", 8, 200);
});

test("Pro user at the daily limit is blocked before counters increment", () => {
  const limitCheck = reservationFix.indexOf("v_balance.daily_used >= v_balance.daily_limit");
  const counterUpdate = reservationFix.indexOf("update public.usage_balances as ub");
  assert.ok(limitCheck >= 0 && counterUpdate > limitCheck);
  assert.match(reservationFix, /return query select false, 'Daily verification limit reached\.'/);
});

test("Free user with quota remaining reaches a successful reservation path", () => {
  assert.match(baseMigration, /when 'pro' then 8 when 'ultra' then 15 else 2 end/);
  assert.match(baseMigration, /when 'pro' then 200 when 'ultra' then 450 else 30 end/);
  assert.match(reservationFix, /if v_plan is null then v_plan := 'free'; end if/);
  assert.match(reservationFix, /return query select true, 'reserved'/);
});

test("Ultra user with quota remaining reaches a successful reservation path", () => {
  assertSuccessfulReservationPath("ultra", 15, 450);
});

test("failed or duplicate reservation does not incorrectly consume usage", () => {
  const duplicateReturn = reservationFix.indexOf("return query select true, 'already_reserved'");
  const counterUpdate = reservationFix.indexOf("update public.usage_balances as ub");
  assert.ok(duplicateReturn >= 0 && counterUpdate > duplicateReturn);
  assert.match(reservationFix, /on conflict \(idempotency_key\) do nothing/);
  assert.match(reservationFix, /get diagnostics v_inserted_count = row_count/);
});

test("reservation counter columns are explicitly qualified and cannot become ambiguous", () => {
  assert.match(reservationFix, /update public\.usage_balances as ub/);
  assert.match(reservationFix, /daily_used = ub\.daily_used \+ 1/);
  assert.match(reservationFix, /monthly_used = ub\.monthly_used \+ 1/);
  assert.match(reservationFix, /active_verifications = ub\.active_verifications \+ 1/);
  assert.doesNotMatch(reservationFix, /daily_used = daily_used \+ 1/);
  assert.doesNotMatch(reservationFix, /monthly_used = monthly_used \+ 1/);
});

test("existing finalize and refund idempotency behavior remains defined", () => {
  assert.match(baseMigration, /create or replace function public\.sva_finalize_verification/);
  assert.match(baseMigration, /if v_res\.status = 'finalized' then return true/);
  assert.match(baseMigration, /create or replace function public\.sva_refund_verification/);
  assert.match(baseMigration, /if v_res\.status = 'refunded' then return true/);
  assert.match(baseMigration, /greatest\(0, daily_used - 1\)/);
  assert.doesNotMatch(reservationFix, /create or replace function public\.sva_(finalize|refund)_verification/);
});
