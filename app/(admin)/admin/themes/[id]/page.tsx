"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComplianceStatus } from "@/lib/schemeRules";
import { ConnectedImpactPanel } from "@/app/components/ConnectedImpactPanel";

interface ThemeDetailResponse {
  theme: {
    id: string;
    name: string;
    sector: string;
    description: string | null;
    submissionCount: number;
    locationName: string;
    submissions: {
      trackingId: string;
      summary: string | null;
      urgencySignal: number;
      submitterName: string | null;
      timestamp: string | null;
    }[];
    overlappingWorks: { id: string; workName: string; amount: number; dateRecommended: string | null }[];
  };
  projects: {
    id: string;
    name: string;
    description: string | null;
    rationale: string | null;
    sector: string;
    estimatedCost: number;
    overlapsExistingWork: boolean;
    overlappingWorks: { workName: string; amount: number; dateRecommended: string | null }[];
    feasibility: {
      overall: ComplianceStatus;
      rules: { ruleId: string; ruleName: string; status: ComplianceStatus; explanation: string }[];
    };
  }[];
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

export default function ThemeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const [data, setData] = useState<ThemeDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/themes/${id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load theme");
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load theme");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  const toggleCompare = (projectId: string) => {
    setSelectedForCompare((prev) =>
      prev.includes(projectId)
        ? prev.filter((p) => p !== projectId)
        : prev.length < 3
          ? [...prev, projectId]
          : prev
    );
  };

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <Link href="/admin" className="text-sm text-accent hover:underline">
        ← Back to dashboard
      </Link>

      {loading && <p className="mt-4 text-text-secondary">Loading…</p>}
      {error && (
        <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
      )}

      {data && (
        <>
          <header className="mt-4 rounded-2xl bg-bg-elevated p-5 shadow-[var(--shadow-elevated)]">
            <p className="text-sm font-medium uppercase tracking-widest text-accent">
              {data.theme.sector} · {data.theme.locationName}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-text-primary">{data.theme.name}</h1>
            <p className="mt-2 text-text-secondary">{data.theme.description}</p>
            <p className="mt-2 text-sm text-text-secondary">
              {data.theme.submissionCount} citizen report{data.theme.submissionCount === 1 ? "" : "s"}
            </p>
          </header>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-2xl bg-bg-elevated p-5 shadow-[var(--shadow-elevated)]">
              <h2 className="mb-3 text-lg font-semibold text-text-primary">Citizen reports</h2>
              {data.theme.submissions.length === 0 ? (
                <p className="text-text-secondary">No linked submissions.</p>
              ) : (
                <ul className="space-y-2">
                  {data.theme.submissions.map((s) => (
                    <li
                      key={s.trackingId}
                      className="rounded-lg border border-[var(--border)] p-3 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-text-secondary">{s.trackingId}</span>
                        <span className="text-xs text-text-secondary">
                          urgency {s.urgencySignal.toFixed(1)}
                        </span>
                      </div>
                      <p className="mt-1 text-text-primary">{s.summary}</p>
                      {s.submitterName && (
                        <p className="mt-1 text-xs text-text-secondary">— {s.submitterName}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl bg-bg-elevated p-5 shadow-[var(--shadow-elevated)]">
              <h2 className="mb-3 text-lg font-semibold text-text-primary">
                Existing sanctioned works ({data.theme.sector})
              </h2>
              {data.theme.overlappingWorks.length === 0 ? (
                <p className="text-text-secondary">
                  No existing MPLADS works in this sector at this location.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.theme.overlappingWorks.map((w) => (
                    <li key={w.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
                      <p className="text-text-primary">{w.workName}</p>
                      <p className="text-xs text-text-secondary">
                        {formatINR(w.amount)} · recommended {w.dateRecommended ?? "n/a"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="mt-4 rounded-2xl bg-bg-elevated p-5 shadow-[var(--shadow-elevated)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Candidate projects</h2>
              {selectedForCompare.length > 0 && (
                <button
                  onClick={() =>
                    router.push(`/admin/simulate?ids=${selectedForCompare.join(",")}`)
                  }
                  className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
                >
                  Compare {selectedForCompare.length} project
                  {selectedForCompare.length === 1 ? "" : "s"}
                </button>
              )}
            </div>

            {data.projects.length === 0 ? (
              <p className="text-text-secondary">
                No candidate projects generated (LLM extraction may have failed — try reloading).
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.projects.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col rounded-xl border border-[var(--border)] p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-text-primary">{p.name}</p>
                      <StatusBadge status={p.feasibility.overall} />
                    </div>
                    <p className="mt-1 flex-1 text-sm text-text-secondary">{p.description}</p>
                    <p className="mt-2 text-sm font-medium text-text-primary">
                      {formatINR(p.estimatedCost)}
                    </p>
                    {p.overlapsExistingWork && (
                      <p className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-500">
                        ⚠ May duplicate {p.overlappingWorks[0]?.workName}
                        {p.overlappingWorks[0]?.dateRecommended
                          ? `, recommended ${p.overlappingWorks[0].dateRecommended}`
                          : ""}
                        {p.overlappingWorks[0]?.amount
                          ? ` (${formatINR(p.overlappingWorks[0].amount)})`
                          : ""}
                      </p>
                    )}
                    <label className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={selectedForCompare.includes(p.id)}
                        onChange={() => toggleCompare(p.id)}
                      />
                      Add to comparison
                    </label>
                    <ConnectedImpactPanel projectId={p.id} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
