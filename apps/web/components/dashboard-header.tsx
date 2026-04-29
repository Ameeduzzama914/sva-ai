"use client";

import { type ChangeEvent, type FormEvent } from "react";
import type { VerificationMode } from "../lib/models";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

type DashboardHeaderProps = {
  prompt: string;
  mode: VerificationMode;
  isLoading: boolean;
  onPromptChange: (value: string) => void;
  onModeChange: (mode: VerificationMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  elapsedLabel?: string;
};

export const DashboardHeader = ({
  prompt,
  mode,
  isLoading,
  onPromptChange,
  onModeChange,
  onSubmit,
  elapsedLabel
}: DashboardHeaderProps) => {
  return (
    <Card>
      <form onSubmit={onSubmit}>
        <textarea
          className="h-32 w-full resize-none rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-100 outline-none ring-violet-400 transition placeholder:text-slate-500 focus:ring-2"
          placeholder="Ask SVA anything and verify across 5 AI models..."
          value={prompt}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onPromptChange(event.target.value)}
          required
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button type="button" variant={mode === "fast" ? "primary" : "secondary"} onClick={() => onModeChange("fast")}>
              Fast Mode
            </Button>
            <Button type="button" variant={mode === "deep" ? "primary" : "secondary"} onClick={() => onModeChange("deep")}>
              Deep Verify
            </Button>
            <Button type="button" variant={mode === "research" ? "primary" : "secondary"} onClick={() => onModeChange("research")}>
              Research Mode
              <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">NEW</span>
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <p className="text-xs text-emerald-300">{elapsedLabel ?? "Run verification to generate trust score"}</p>
            <Button type="submit" variant="primary" disabled={isLoading}>
              {isLoading ? "Verifying..." : "Run Verification"}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
};
