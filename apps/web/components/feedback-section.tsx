"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

export const FeedbackSection = () => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const displayRating = hoverRating || rating;

  const handleSubmit = () => {
    if (rating === 0) return;
    setSubmitted(true);
  };

  return (
    <Card className="border-slate-700/80 bg-slate-950/40">
      <h3 className="text-sm font-semibold text-slate-100">Help improve SVA</h3>
      <p className="mt-1 text-xs text-slate-400">Rate your experience — feedback stays on this device only.</p>

      {submitted ? (
        <p className="mt-4 text-sm text-emerald-300">Thanks for your feedback!</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-1" role="group" aria-label="Rate SVA">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className="rounded p-1 transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                aria-label={`${star} star${star === 1 ? "" : "s"}`}
                aria-pressed={rating === star}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className={`h-8 w-8 ${star <= displayRating ? "fill-amber-400 text-amber-400" : "fill-transparent text-slate-600"}`}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
                  />
                </svg>
              </button>
            ))}
            {rating > 0 ? (
              <span className="ml-2 text-xs text-slate-400">{rating}/5</span>
            ) : null}
          </div>

          <textarea
            className="min-h-[72px] w-full resize-y rounded-xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-100 outline-none ring-violet-400 transition placeholder:text-slate-500 focus:ring-2"
            placeholder="Optional: what worked well or what should improve?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <Button type="button" variant="primary" onClick={handleSubmit} disabled={rating === 0}>
            Submit feedback
          </Button>
        </div>
      )}
    </Card>
  );
};
