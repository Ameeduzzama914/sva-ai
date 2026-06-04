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

const examples = [
  "Is drinking coffee before noon generally safe for healthy adults?",
  "Did India land Chandrayaan-3 near the Moon's south pole?",
  "Can a VPN make online banking fully anonymous?"
];

export const DashboardHeader = ({ prompt, mode, isLoading, onPromptChange, onModeChange, onSubmit, elapsedLabel }: DashboardHeaderProps) => {
  return (
    <Card className="shadow-lg shadow-black/20">
      <form onSubmit={onSubmit}>
        <textarea
          className="h-32 w-full resize-none rounded-xl border border-slate-700/90 bg-slate-950/80 p-4 text-sm leading-relaxed text-slate-100 shadow-inner shadow-black/20 outline-none ring-violet-400/80 transition placeholder:text-sm placeholder:italic placeholder:text-slate-500/90 focus:border-violet-500/40 focus:ring-2 focus:ring-violet-400/30"
          placeholder="Ask SVA anything and verify across multiple AI models..."
          value={prompt}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onPromptChange(event.target.value)}
          required
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((example) => (
            <button key={example} type="button" className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-left text-xs text-slate-300 transition hover:border-violet-400/50 hover:text-violet-200" onClick={() => onPromptChange(example)}>
              {example}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={mode === "fast" ? "primary" : "secondary"} onClick={() => onModeChange("fast")}>Fast Mode</Button>
            <Button type="button" variant={mode === "deep" ? "primary" : "secondary"} onClick={() => onModeChange("deep")}>Deep Verify</Button>
            <Button type="button" variant={mode === "research" ? "primary" : "secondary"} onClick={() => onModeChange("research")}>Research Mode<span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">NEW</span></Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-emerald-300">{elapsedLabel ?? "Run verification to generate trust score"}</p>
            <Button type="submit" variant="primary" disabled={isLoading || !prompt.trim()}>
              {isLoading ? "Verifying..." : "Run Verification"}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
};
