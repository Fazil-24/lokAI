import Link from "next/link";
import { PriorityGraphView } from "@/app/components/PriorityGraphView";

export default function GraphPage() {
  return (
    <main className="min-h-screen p-4 sm:p-6">
      <Link href="/admin" className="text-sm text-accent hover:underline">
        ← Back to dashboard
      </Link>
      <div className="mt-3">
        <p className="text-sm font-medium uppercase tracking-widest text-accent">
          Priority graph
        </p>
        <h1 className="text-2xl font-semibold text-text-primary">
          What&apos;s actually connected
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          Every node and edge here is a real record and a real relationship in the graph —
          issue themes, the project options they suggest, the locations they affect, the scheme
          rules that permit them, and any sanctioned MPLADS work they overlap with. Nothing is
          laid out by an LLM guess.
        </p>
      </div>

      <div className="mt-4 rounded-2xl bg-bg-elevated p-4 shadow-[var(--shadow-elevated)] sm:p-6">
        <PriorityGraphView />
      </div>
    </main>
  );
}
