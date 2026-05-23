import { Card } from "../ui/card";

type PlaceholderMetric = {
  title: string;
  value: string;
  hint: string;
  icon: string;
};

const metrics: PlaceholderMetric[] = [
  { title: "Total Users", value: "—", hint: "Analytics pending", icon: "👥" },
  { title: "Verifications Today", value: "—", hint: "Analytics pending", icon: "✓" },
  { title: "Feedback Count", value: "—", hint: "Analytics pending", icon: "★" },
  { title: "System Status", value: "Demo", hint: "Live monitoring pending", icon: "◉" }
];

export const AdminPlaceholderCards = () => (
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    {metrics.map((metric) => (
      <Card
        key={metric.title}
        className="group border-slate-800/80 bg-slate-950/60 backdrop-blur-sm transition hover:border-violet-500/40 hover:shadow-[0_0_28px_rgba(139,92,246,0.12)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{metric.title}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-50">{metric.value}</p>
            <p className="mt-1 text-xs text-slate-500">{metric.hint}</p>
          </div>
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10 text-lg text-violet-200 transition group-hover:border-violet-400/40 group-hover:shadow-[0_0_18px_rgba(139,92,246,0.2)]"
            aria-hidden
          >
            {metric.icon}
          </span>
        </div>
      </Card>
    ))}
  </div>
);
