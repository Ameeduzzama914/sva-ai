import { Badge } from "../ui/badge";
import type { UserPlan } from "../../lib/server/store";

export const planLabel = (plan: UserPlan): string => {
  if (plan === "ultra") {
    return "Ultra";
  }
  if (plan === "pro") {
    return "Pro";
  }
  return "Free";
};

export const PlanBadge = ({ plan }: { plan: UserPlan }) => {
  const variant = plan === "ultra" ? "violet" : plan === "pro" ? "indigo" : "neutral";
  return <Badge variant={variant}>{planLabel(plan)}</Badge>;
};

export const StatusBadge = ({ status }: { status: "active" | "idle" }) => (
  <Badge variant={status === "active" ? "success" : "warning"}>{status === "active" ? "Active" : "Idle"}</Badge>
);
