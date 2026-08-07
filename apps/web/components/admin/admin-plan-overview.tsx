import { SVA_PLANS } from "../../lib/plans";
import { ProviderLogo } from "../provider-logo";
import { Badge } from "../ui/badge";
import { AdminSection } from "./admin-section";

const plans = [
  {
    name: "Free",
    models: ["GPT", "Gemini", "DeepSeek"],
    limit: `${SVA_PLANS.free.dailyVerificationLimit}/day, ${SVA_PLANS.free.monthlyVerificationLimit}/billing period`,
    variant: "neutral" as const
  },
  {
    name: "Pro",
    models: ["GPT", "Gemini", "DeepSeek"],
    limit: `${SVA_PLANS.pro.dailyVerificationLimit}/day, ${SVA_PLANS.pro.monthlyVerificationLimit}/billing period`,
    variant: "indigo" as const
  },
  {
    name: "Ultra",
    models: ["GPT", "Gemini", "DeepSeek"],
    limit: `${SVA_PLANS.ultra.dailyVerificationLimit}/day, ${SVA_PLANS.ultra.monthlyVerificationLimit}/billing period`,
    variant: "violet" as const
  }
];

export const AdminPlanOverview = () => (
  <AdminSection title="Plan overview" subtitle="Informational rules for founder reference; not editable here.">
    <div className="grid gap-4 md:grid-cols-3">
      {plans.map((plan) => (
        <article
          key={plan.name}
          className="rounded-xl border border-slate-800/80 bg-gradient-to-br from-slate-950/80 to-violet-950/20 p-4"
        >
          <Badge variant={plan.variant}>{plan.name}</Badge>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {plan.models.map((model) => (
              <li key={model} className="flex items-center gap-2">
                <ProviderLogo provider={model} size="sm" />
                <span>{model}</span>
              </li>
            ))}
            <li className="text-xs text-slate-400">Verified Mode allowance: {plan.limit}</li>
          </ul>
        </article>
      ))}
    </div>
  </AdminSection>
);
