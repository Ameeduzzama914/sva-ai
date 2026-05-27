import type { AdminFeedbackRecord } from "../../lib/admin-types";
import { AdminSection } from "./admin-section";

type AdminFeedbackSectionProps = {
  feedback: AdminFeedbackRecord[];
  emptyMessage: string | null;
};

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const Stars = ({ rating }: { rating: number | null }) => {
  if (!rating) {
    return <span className="text-xs text-slate-500">No rating stored</span>;
  }
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= rating ? "text-amber-400" : "text-slate-600"}>
          ★
        </span>
      ))}
    </div>
  );
};

export const AdminFeedbackSection = ({ feedback, emptyMessage }: AdminFeedbackSectionProps) => (
  <AdminSection title="Feedback & reviews" subtitle="Centralized feedback from server analytics events.">
    {emptyMessage && feedback.length === 0 ? (
      <p className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-8 text-center text-sm text-slate-400">{emptyMessage}</p>
    ) : (
      <div className="grid gap-3 md:grid-cols-2">
        {feedback.map((item) => (
          <article
            key={item.id}
            className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 shadow-[0_0_24px_rgba(139,92,246,0.06)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-100">{item.email}</p>
              <p className="text-xs text-slate-500">{formatDate(item.timestamp)}</p>
            </div>
            <div className="mt-2">
              <Stars rating={item.rating} />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              {item.comment || "No comment text stored for this entry."}
            </p>
          </article>
        ))}
      </div>
    )}
  </AdminSection>
);
