import type { VerificationUsageSummary } from "../models";
import { getPlanDailyVerificationLimit } from "./plan-limits";
import {
  consumeDailyVerificationQuota,
  refundDailyVerificationQuota,
  type UserPlan
} from "./store";
import { getSupabaseAdminClient } from "./supabase-admin";
import { consumeSupabaseDailyVerificationQuota, refundSupabaseDailyVerificationQuota } from "./supabase-usage";

type ReserveRpcRow = {
  ok?: boolean;
  message?: string;
  plan?: UserPlan;
  daily_used?: number;
  daily_limit?: number;
  monthly_used?: number;
  monthly_limit?: number;
};

export type VerificationReservation = {
  source: "rpc" | "supabase-legacy" | "local";
  verificationId: string;
  userId: string;
  plan: UserPlan;
  usage: VerificationUsageSummary;
};

export type ReservationResult =
  | { ok: true; reservation: VerificationReservation }
  | { ok: false; status: number; message: string };

const isUserPlan = (value: unknown): value is UserPlan =>
  value === "free" || value === "pro" || value === "ultra";

const firstRpcRow = (data: unknown): ReserveRpcRow | null => {
  if (Array.isArray(data)) return (data[0] as ReserveRpcRow | undefined) ?? null;
  if (data && typeof data === "object") return data as ReserveRpcRow;
  return null;
};

const usageFromRpc = (row: ReserveRpcRow, fallbackPlan: UserPlan): VerificationUsageSummary => {
  const plan = isUserPlan(row.plan) ? row.plan : fallbackPlan;
  const usedToday = typeof row.daily_used === "number" ? row.daily_used : 0;
  const dailyLimit = typeof row.daily_limit === "number" ? row.daily_limit : getPlanDailyVerificationLimit(plan);
  return {
    plan,
    usedToday,
    dailyLimit,
    creditsRemaining: Math.max(0, dailyLimit - usedToday)
  };
};

export const reserveVerificationAllowance = async (input: {
  userId: string;
  plan: UserPlan;
  verificationId: string;
  idempotencyKey: string;
  creditsUsed: number;
  metadata?: Record<string, unknown>;
}): Promise<ReservationResult> => {
  const client = getSupabaseAdminClient();

  if (client) {
    const { data, error } = await client.rpc("sva_reserve_verification", {
      p_user_id: input.userId,
      p_verification_id: input.verificationId,
      p_idempotency_key: input.idempotencyKey,
      p_metadata: input.metadata ?? {}
    });

    if (!error) {
      const row = firstRpcRow(data);
      if (row?.ok) {
        const usage = usageFromRpc(row, input.plan);
        return {
          ok: true,
          reservation: {
            source: "rpc",
            verificationId: input.verificationId,
            userId: input.userId,
            plan: usage.plan,
            usage
          }
        };
      }
      return { ok: false, status: 403, message: row?.message ?? "Verification limit exceeded. Upgrade your plan or wait for reset." };
    }

    console.error("[verification-reservations] reserve RPC failed, using legacy quota fallback:", error.message);

    const legacyQuota = await consumeSupabaseDailyVerificationQuota(input.userId, input.creditsUsed);
    if (legacyQuota) {
      if (!legacyQuota.ok || legacyQuota.usedToday > legacyQuota.dailyLimit) {
        return { ok: false, status: 403, message: "Verification limit exceeded. Upgrade your plan or wait for reset." };
      }
      return {
        ok: true,
        reservation: {
          source: "supabase-legacy",
          verificationId: input.verificationId,
          userId: input.userId,
          plan: legacyQuota.plan,
          usage: {
            plan: legacyQuota.plan,
            usedToday: legacyQuota.usedToday,
            dailyLimit: legacyQuota.dailyLimit,
            creditsRemaining: legacyQuota.creditsRemaining
          }
        }
      };
    }
  }

  const localQuota = await consumeDailyVerificationQuota(input.userId);
  if (!localQuota) {
    return { ok: false, status: 503, message: "Unable to verify usage quota. Please try again." };
  }
  if (!localQuota.ok) {
    return { ok: false, status: 403, message: "Verification limit exceeded. Upgrade your plan or wait for reset." };
  }

  return {
    ok: true,
    reservation: {
      source: "local",
      verificationId: input.verificationId,
      userId: input.userId,
      plan: localQuota.plan,
      usage: {
        plan: localQuota.plan,
        usedToday: localQuota.usedToday,
        dailyLimit: localQuota.dailyLimit,
        creditsRemaining: Math.max(0, localQuota.dailyLimit - localQuota.usedToday)
      }
    }
  };
};

export const finalizeVerificationReservation = async (reservation: VerificationReservation): Promise<boolean> => {
  if (reservation.source !== "rpc") return true;
  const client = getSupabaseAdminClient();
  if (!client) return false;
  const { error } = await client.rpc("sva_finalize_verification", { p_verification_id: reservation.verificationId });
  if (error) {
    console.error("[verification-reservations] finalize RPC failed:", error.message);
    return false;
  }
  return true;
};

export const refundVerificationReservation = async (reservation: VerificationReservation | null, creditsUsed: number): Promise<boolean> => {
  if (!reservation) return false;

  if (reservation.source === "rpc") {
    const client = getSupabaseAdminClient();
    if (!client) return false;
    const { error } = await client.rpc("sva_refund_verification", { p_verification_id: reservation.verificationId });
    if (error) {
      console.error("[verification-reservations] refund RPC failed:", error.message);
      return false;
    }
    return true;
  }

  if (reservation.source === "supabase-legacy") {
    return refundSupabaseDailyVerificationQuota(reservation.userId, creditsUsed);
  }

  await refundDailyVerificationQuota(reservation.userId);
  return true;
};
