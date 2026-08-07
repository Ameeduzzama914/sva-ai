import { randomUUID } from "crypto";
import { getSupabaseAdminClient } from "./supabase-admin";

export type AdminAlertSeverity = "info" | "warning" | "critical";

export type AdminAlertInput = {
  alertType: string;
  severity: AdminAlertSeverity;
  source: string;
  message: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

const cleanMetadata = (metadata: AdminAlertInput["metadata"]): Record<string, string | number | boolean | null> | undefined => {
  if (!metadata) return undefined;
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined)) as Record<string, string | number | boolean | null>;
};

export const createAdminAlert = async (input: AdminAlertInput): Promise<boolean> => {
  const client = getSupabaseAdminClient();
  if (!client) {
    console.error("[admin-alert]", {
      alertType: input.alertType,
      severity: input.severity,
      source: input.source,
      message: input.message,
      metadata: cleanMetadata(input.metadata)
    });
    return false;
  }

  const { error } = await client.from("admin_alerts").insert({
    id: randomUUID(),
    alert_type: input.alertType,
    severity: input.severity,
    source: input.source,
    message: input.message,
    metadata: cleanMetadata(input.metadata) ?? {},
    resolved: false,
    created_at: new Date().toISOString()
  });

  if (error) {
    console.error("[admin-alert] insert failed:", error.message);
    return false;
  }

  return true;
};
