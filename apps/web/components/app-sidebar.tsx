import { Button } from "./ui/button";

const sectionClass = "space-y-1";
const itemClass = "block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800";

type AppSidebarProps = {
  contradictionCount?: number;
};

export const AppSidebar = ({ contradictionCount = 0 }: AppSidebarProps) => {
  return (
    <aside className="w-[260px] border-r border-slate-800 bg-[#0b1020] p-4">
      <div className="mb-8">
        <h1 className="text-lg font-bold text-white">SVA</h1>
        <p className="text-xs text-slate-400">Super Verified AI</p>
      </div>

      <div className="space-y-6">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ask & Verify</p>
          <div className={sectionClass}>
            <button className={`${itemClass} border border-violet-500/40 bg-violet-500/15 text-violet-200`}>New Query</button>
            <button className={itemClass}>Dashboard</button>
            <button className={itemClass}>History</button>
            <button className={itemClass}>Bookmarks</button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Verify</p>
          <div className={sectionClass}>
            <button className={itemClass}>Multi-AI Comparison</button>
            <button className={itemClass}>Claim Verification</button>
            <button className={itemClass}>Evidence Engine</button>
            <button className={`${itemClass} flex items-center justify-between`}>
              Contradictions
              {contradictionCount > 0 ? <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300">{contradictionCount}</span> : null}
            </button>
            <button className={itemClass}>SVA Judge</button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tools</p>
          <div className={sectionClass}>
            <button className={itemClass}>Chrome Extension</button>
            <button className={itemClass}>API Access</button>
            <button className={itemClass}>Integrations</button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Account</p>
          <div className={sectionClass}>
            <button className={itemClass}>Settings</button>
            <button className={itemClass}>Usage & Plan</button>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/20 to-blue-500/10 p-4">
        <p className="text-sm font-semibold text-slate-100">SVA Pro</p>
        <p className="mt-1 text-xs text-slate-300">Unlock deep verification and higher daily usage.</p>
        <Button variant="primary" className="mt-3 w-full">
          Upgrade Plan
        </Button>
      </div>
    </aside>
  );
};
