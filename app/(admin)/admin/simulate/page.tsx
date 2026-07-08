"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ComplianceStatus } from "@/lib/schemeRules";

interface Comparison {
  id: string;
  name: string;
  description: string | null;
  sector: string;
  estimatedCost: number;
  locationName: string;
  overlapsExistingWork: boolean;
  overlappingWorks: { workName: string; amount: number; dateRecommended: string | null }[];
  feasibility: {
    overall: ComplianceStatus;
    rules: { ruleId: string; ruleName: string; status: ComplianceStatus; explanation: string }[];
  };
  beneficiaryContext: { submissionCount: number; locationName: string } | null;
  narration: string;
}

function StatusBadge({ status }: { status: ComplianceStatus }) {
  const colors: Record<ComplianceStatus, string> = {
    GREEN: "bg-green-500/15 text-green-600",
    AMBER: "bg-amber-500/15 text-amber-600",
    RED: "bg-red-500/15 text-red-600",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}>{status}</span>
  );
}

function formatINR(amount: number): string {
  return `₹${new Intl.NumberFormat("en-IN").format(Math.round(amount))}`;
}

export default function SimulatePage() {
  const searchParams = useSearchParams();
  const ids = (searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [loading, setLoading] = useState(ids.length > 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length === 0) {
      return;
    }
    async function load() {
      try {
        const res = await fetch("/api/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectIds: ids }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Simulation failed");
        setComparisons(json.comparisons);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Simulation failed");
      } finally {
        setLoading(false);
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("ids")]);

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <Link href="/admin" className="text-sm text-accent hover:underline">
        ← Back to dashboard
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-text-primary">Trade-off simulator</h1>

      {loading && <p className="mt-4 text-text-secondary">Comparing…</p>}
      {error && (
        <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
      )}
      {!loading && comparisons.length === 0 && !error && (
        <p className="mt-4 text-text-secondary">
          No projects selected. Go to a theme detail page and add projects to comparison.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {comparisons.map((c) => (
          <div key={c.id} className="rounded-2xl bg-bg-elevated p-5 shadow-[var(--shadow-elevated)]">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold text-text-primary">{c.name}</h2>
              <StatusBadge status={c.feasibility.overall} />
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              {c.sector} · {c.locationName}
            </p>
            <p className="mt-3 text-sm text-text-primary">{c.description}</p>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">Budget band</dt>
                <dd className="font-medium text-text-primary">{formatINR(c.estimatedCost)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Citizen reports behind this need</dt>
                <dd className="font-medium text-text-primary">
                  {c.beneficiaryContext?.submissionCount ?? "n/a"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Scheme compatibility</dt>
                <dd>
                  <StatusBadge status={c.feasibility.overall} />
                </dd>
              </div>
            </dl>

            {c.overlapsExistingWork && (
              <p className="mt-3 rounded-lg bg-red-500/10 p-2 text-xs text-red-500">
                ⚠ May duplicate {c.overlappingWorks[0]?.workName}
                {c.overlappingWorks[0]?.dateRecommended
                  ? `, recommended ${c.overlappingWorks[0].dateRecommended}`
                  : ""}
              </p>
            )}

            <div className="mt-4 border-t border-[var(--border)] pt-3">
              <p className="text-xs font-medium uppercase tracking-widest text-accent">
                Why recommended
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {c.narration || "Explanation unavailable right now."}
              </p>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-text-secondary">
                Rule-by-rule feasibility
              </summary>
              <ul className="mt-2 space-y-2">
                {c.feasibility.rules.map((r) => (
                  <li key={r.ruleId} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-text-primary">{r.ruleName}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-text-secondary">{r.explanation}</p>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ))}
      </div>
    </main>
  );
}
