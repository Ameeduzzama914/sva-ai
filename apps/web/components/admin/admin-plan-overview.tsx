import { Badge } from "../ui/badge";
import { AdminSection } from "./admin-section";

const plans = [
  {
    name: "Free",
    models: ["Mistral AI", "Llama AI", "Gemma AI"],
    limit: "Basic daily limit (15 verifications/day server quota)",
    variant: "neutral" as const
  },
  {
    name: "Pro",
    models: ["GPT", "Gemini", "DeepSeek"],
    limit: "Higher daily limit (150 monthly credits)",
    variant: "indigo" as const
  },
  {
    name: "Ultra",
    models: ["GPT", "Gemini", "DeepSeek", "Future premium model layer"],
    limit: "Highest daily limit (500 monthly credits)",
    variant: "violet" as const
  }
];

export const AdminPlanOverview = () => (
  <AdminSection title="Plan overview" subtitle="Informational rules for founder reference — not editable here.">
    <div className="grid gap-4 md:grid-cols-3">
      {plans.map((plan) => (
        <article
          key={plan.name}
          className="rounded-xl border border-slate-800/80 bg-gradient-to-br from-slate-950/80 to-violet-950/20 p-4"
        >
          <Badge variant={plan.variant}>{plan.name}</Badge>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {plan.models.map((model) => (
              <li key={model}>• {model}</li>
            ))}
            <li className="text-xs text-slate-400">• {plan.limit}</li>
          </ul>
        </article>
      ))}
    </div>
  </AdminSection>
);
