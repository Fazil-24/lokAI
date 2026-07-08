"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  DEFAULT_WEIGHTS,
  rankProjects,
  type RankedProject,
  type ScoringWeights,
} from "@/lib/scoring";
import type { ThemeCard } from "@/lib/dashboardData";
import { ConstituencyMapNoSSR } from "@/app/components/ConstituencyMapClient";
import type { MapLocation } from "@/app/components/ConstituencyMap";

interface DashboardSummary {
  recurringIssueThemes: number;
  submissionVolume: number;
  ongoingWorksCount: number;
  ongoingWorksTotalAllocation: number;
  affectedPopulationEstimate: number;
  schemeCompatibleThemeCount: number;
}

const WEIGHT_LABELS: { key: keyof ScoringWeights; label: string; hint: string }[] = [
  { key: "w1", label: "Demand", hint: "Linked submissions/themes" },
  { key: "w2", label: "Urgency", hint: "Recurrence + severity" },
  { key: "w3", label: "Demographic gap", hint: "e.g. literacy/capacity gap" },
  { key: "w4", label: "Scheme fit", hint: "Eligible + co-funding %" },
  { key: "w5", label: "Equity", hint: "Under-served locations" },
  { key: "w6", label: "Overlap penalty", hint: "Duplicates existing work" },
];

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-IN").format(Math.round(n));
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [cards, setCards] = useState<ThemeCard[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [mapLocations, setMapLocations] = useState<MapLocation[]>([]);
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [themesRes, summaryRes, mapRes] = await Promise.all([
          fetch("/api/themes"),
          fetch("/api/dashboard-summary"),
          fetch("/api/map"),
        ]);
        if (!themesRes.ok || !summaryRes.ok || !mapRes.ok)
          throw new Error("Failed to load dashboard data");
        const themesData = await themesRes.json();
        const summaryData = await summaryRes.json();
        const mapData = await mapRes.json();
        setCards(themesData.themes);
        setSummary(summaryData);
        setMapLocations(mapData.locations);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const ranked: RankedProject[] = useMemo(
    () => rankProjects(cards.map((c) => c.features), weights),
    [cards, weights]
  );

  const cardById = useMemo(() => new Map(cards.map((c) => [c.features.id, c])), [cards]);

  const selected = selectedId
    ? ranked.find((r) => r.project.id === selectedId)
    : ranked[0];

  const selectedLocationId = selected ? cardById.get(selected.project.id)?.locationId : null;

  const handleSelectLocation = (locationId: string) => {
    const themeAtLocation = ranked.find(
      (r) => cardById.get(r.project.id)?.locationId === locationId
    );
    if (themeAtLocation) setSelectedId(themeAtLocation.project.id);
  };

  const handleLogout = async () => {
    await fetch("/api/admin-logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-accent">
            Officer dashboard
          </p>
          <h1 className="text-2xl font-semibold text-text-primary">Chikballapur Constituency</h1>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-secondary"
        >
          Sign out
        </button>
      </header>

      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
      )}

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryWidget label="Recurring issues" value={formatNumber(summary.recurringIssueThemes)} />
          <SummaryWidget label="Submissions" value={formatNumber(summary.submissionVolume)} />
          <SummaryWidget label="Sanctioned works" value={formatNumber(summary.ongoingWorksCount)} />
          <SummaryWidget
            label="Total allocation"
            value={`₹${formatNumber(summary.ongoingWorksTotalAllocation / 100000)}L`}
          />
          <SummaryWidget
            label="Est. population"
            value={formatNumber(summary.affectedPopulationEstimate)}
          />
          <SummaryWidget
            label="Scheme-compatible"
            value={formatNumber(summary.schemeCompatibleThemeCount)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr_0.9fr]">
        <section className="rounded-2xl bg-bg-elevated p-4 shadow-[var(--shadow-elevated)] sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-text-primary">Priority weights</h2>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {WEIGHT_LABELS.map(({ key, label, hint }) => (
              <div key={key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-text-primary">{label}</span>
                  <span className="text-text-secondary">{weights[key].toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.5}
                  value={weights[key]}
                  onChange={(e) =>
                    setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))
                  }
                  className="mt-1 w-full accent-[var(--accent)]"
                />
                <p className="text-xs text-text-secondary/70">{hint}</p>
              </div>
            ))}
          </div>

          <h2 className="mb-3 text-lg font-semibold text-text-primary">Ranked issue themes</h2>
          {loading ? (
            <p className="text-text-secondary">Loading…</p>
          ) : ranked.length === 0 ? (
            <p className="text-text-secondary">
              No issue themes yet — submissions from /submit will appear here.
            </p>
          ) : (
            <ul className="space-y-2">
              {ranked.map((r) => {
                const card = cardById.get(r.project.id);
                return (
                  <motion.li
                    key={r.project.id}
                    layout
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    onClick={() => setSelectedId(r.project.id)}
                    className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                      selected?.project.id === r.project.id
                        ? "border-accent bg-bg-secondary"
                        : "border-[var(--border)] hover:bg-bg-secondary/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                            {r.rank}
                          </span>
                          <span className="font-medium text-text-primary">{r.project.name}</span>
                        </div>
                        <p className="mt-1 text-xs text-text-secondary">
                          {card?.locationName} · {card?.sector}
                          {r.project.overlapsExistingWork && (
                            <span className="ml-2 text-red-500">⚠ possible duplication</span>
                          )}
                        </p>
                      </div>
                      <span className="font-mono text-sm text-text-secondary">
                        {r.breakdown.total.toFixed(2)}
                      </span>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl bg-bg-elevated p-4 shadow-[var(--shadow-elevated)] sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Demand heatmap</h2>
            <div className="flex items-center gap-3 text-xs text-text-secondary">
              <LegendDot color="#8a7f61" label="Low" />
              <LegendDot color="#c1af8b" label="Med" />
              <LegendDot color="#dc2626" label="High" />
            </div>
          </div>
          <div className="h-[400px] overflow-hidden rounded-xl">
            <ConstituencyMapNoSSR
              locations={mapLocations}
              selectedLocationId={selectedLocationId}
              onSelectLocation={handleSelectLocation}
            />
          </div>
          <p className="mt-2 text-xs text-text-secondary/70">
            Circle size/color = submissions + issue themes at that block. Town-center points —
            not precise ward boundaries.
          </p>
        </section>

        <section className="rounded-2xl bg-bg-elevated p-4 shadow-[var(--shadow-elevated)] sm:p-6">
          <h2 className="mb-3 text-lg font-semibold text-text-primary">Score breakdown</h2>
          {!selected ? (
            <p className="text-text-secondary">Select a theme to see its score breakdown.</p>
          ) : (
            <div className="space-y-3">
              <p className="font-medium text-text-primary">{selected.project.name}</p>
              {(
                [
                  ["demand", "Demand"],
                  ["urgency", "Urgency"],
                  ["demographicGap", "Demographic gap"],
                  ["schemeFit", "Scheme fit"],
                  ["equity", "Equity"],
                  ["overlapPenalty", "Overlap penalty"],
                ] as const
              ).map(([key, label]) => {
                const factor = selected.breakdown.factors[key];
                const widthPct = Math.min(100, Math.abs(factor.contribution) * 33.3);
                const isPenalty = factor.contribution < 0;
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs text-text-secondary">
                      <span>{label}</span>
                      <span>{factor.contribution.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-bg-secondary">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${widthPct}%` }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className={`h-full rounded-full ${isPenalty ? "bg-red-500" : "bg-accent"}`}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="mt-4 border-t border-[var(--border)] pt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Total score</span>
                  <span className="font-mono font-semibold text-text-primary">
                    {selected.breakdown.total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function SummaryWidget({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg-elevated p-3 shadow-[var(--shadow-elevated)]">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1 text-lg font-semibold text-text-primary">{value}</p>
    </div>
  );
}
