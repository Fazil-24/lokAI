"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { GraphEdge, GraphNode, GraphNodeLabel, GraphSnapshot } from "@/lib/graphSnapshot";

const WIDTH = 900;
const HEIGHT = 560;

const LABEL_COLORS: Record<GraphNodeLabel, string> = {
  IssueTheme: "#c1af8b",
  ProjectOption: "#4c7a5d",
  Location: "#8a7f61",
  SchemeRule: "#7c6ba6",
  SanctionedWork: "#dc2626",
};

const LABEL_RADIUS: Record<GraphNodeLabel, number> = {
  IssueTheme: 14,
  ProjectOption: 12,
  Location: 10,
  SchemeRule: 9,
  SanctionedWork: 8,
};

/** Rough layered layout bias (fraction of width/height) so the force simulation settles into a legible left-to-right story instead of a random blob. */
const LABEL_BIAS: Record<GraphNodeLabel, { x: number; y: number }> = {
  IssueTheme: { x: 0.16, y: 0.4 },
  ProjectOption: { x: 0.46, y: 0.35 },
  SchemeRule: { x: 0.78, y: 0.18 },
  SanctionedWork: { x: 0.78, y: 0.58 },
  Location: { x: 0.46, y: 0.85 },
};

interface Point {
  x: number;
  y: number;
}

/** Small self-contained force-directed layout — no d3 dependency, runs once per snapshot fetch. */
function computeLayout(nodes: GraphNode[], edges: GraphEdge[]): Map<string, Point> {
  const state = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  nodes.forEach((n, i) => {
    const bias = LABEL_BIAS[n.label];
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
    state.set(n.id, {
      x: bias.x * WIDTH + Math.cos(angle) * 50,
      y: bias.y * HEIGHT + Math.sin(angle) * 50,
      vx: 0,
      vy: 0,
    });
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edgeList = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  const REPULSION = 1600;
  const SPRING = 0.02;
  const IDEAL_LENGTH = 85;
  const CENTER_PULL = 0.012;
  const DAMPING = 0.85;

  for (let iter = 0; iter < 140; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = state.get(nodes[i].id)!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = state.get(nodes[j].id)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = Math.max(1, dx * dx + dy * dy);
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    for (const e of edgeList) {
      const a = state.get(e.source)!;
      const b = state.get(e.target)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const displacement = dist - IDEAL_LENGTH;
      const fx = (dx / dist) * displacement * SPRING;
      const fy = (dy / dist) * displacement * SPRING;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    for (const n of nodes) {
      const p = state.get(n.id)!;
      const bias = LABEL_BIAS[n.label];
      p.vx += (bias.x * WIDTH - p.x) * CENTER_PULL;
      p.vy += (bias.y * HEIGHT - p.y) * CENTER_PULL;
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x = Math.min(WIDTH - 24, Math.max(24, p.x + p.vx));
      p.y = Math.min(HEIGHT - 24, Math.max(24, p.y + p.vy));
    }
  }

  const positions = new Map<string, Point>();
  state.forEach((v, k) => positions.set(k, { x: v.x, y: v.y }));
  return positions;
}

function formatDetailValue(key: string, value: string | number | null): string {
  if (value === null) return "—";
  if (key === "estimatedCost" || key === "amount") {
    return `₹${new Intl.NumberFormat("en-IN").format(Math.round(Number(value)))}`;
  }
  return String(value);
}

function humanizeKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function detailLink(node: GraphNode): string | null {
  if (node.label === "IssueTheme") return `/admin/themes/${node.id}`;
  return null;
}

export function PriorityGraphView() {
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/graph");
        if (!res.ok) throw new Error("Failed to load graph");
        const data: GraphSnapshot = await res.json();
        if (!cancelled) setSnapshot(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load graph");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const positions = useMemo(() => {
    if (!snapshot) return new Map<string, Point>();
    return computeLayout(snapshot.nodes, snapshot.edges);
  }, [snapshot]);

  const connectedIds = useMemo(() => {
    if (!snapshot || !selectedId) return null;
    const ids = new Set<string>([selectedId]);
    for (const e of snapshot.edges) {
      if (e.source === selectedId) ids.add(e.target);
      if (e.target === selectedId) ids.add(e.source);
    }
    return ids;
  }, [snapshot, selectedId]);

  const selectedNode = snapshot?.nodes.find((n) => n.id === selectedId) ?? null;

  if (loading) {
    return <p className="text-text-secondary">Loading priority graph…</p>;
  }
  if (error) {
    return <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>;
  }
  if (!snapshot || snapshot.nodes.length === 0) {
    return (
      <p className="text-text-secondary">
        No graph data yet — issue themes and project options will appear here once citizens
        report issues and an officer opens a theme detail page.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-bg-secondary/40">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full">
          <g>
            {snapshot.edges.map((e) => {
              const a = positions.get(e.source);
              const b = positions.get(e.target);
              if (!a || !b) return null;
              const dimmed = connectedIds ? !(connectedIds.has(e.source) && connectedIds.has(e.target)) : false;
              return (
                <line
                  key={e.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--border)"
                  strokeWidth={dimmed ? 1 : 1.5}
                  style={{ transition: "opacity 300ms ease, stroke-width 300ms ease" }}
                  opacity={dimmed ? 0.12 : 0.55}
                />
              );
            })}
          </g>
          <g>
            {snapshot.nodes.map((n) => {
              const p = positions.get(n.id);
              if (!p) return null;
              const dimmed = connectedIds ? !connectedIds.has(n.id) : false;
              const isSelected = selectedId === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x},${p.y})`}
                  onClick={() => setSelectedId(isSelected ? null : n.id)}
                  className="cursor-pointer"
                >
                  <circle
                    r={LABEL_RADIUS[n.label]}
                    fill={LABEL_COLORS[n.label]}
                    stroke={isSelected ? "var(--text-primary)" : "none"}
                    strokeWidth={2}
                    style={{ transition: "opacity 300ms ease" }}
                    opacity={dimmed ? 0.2 : 1}
                  />
                  <text
                    y={LABEL_RADIUS[n.label] + 12}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--text-secondary)"
                    style={{ transition: "opacity 300ms ease" }}
                    opacity={dimmed ? 0.25 : 1}
                  >
                    {n.name.length > 22 ? `${n.name.slice(0, 20)}…` : n.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="rounded-xl border border-[var(--border)] p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-text-secondary">
          Legend
        </p>
        <ul className="mb-4 space-y-1.5 text-xs text-text-secondary">
          {(Object.keys(LABEL_COLORS) as GraphNodeLabel[]).map((label) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: LABEL_COLORS[label] }}
              />
              {label}
            </li>
          ))}
        </ul>

        <div className="border-t border-[var(--border)] pt-3">
          {!selectedNode ? (
            <p className="text-xs text-text-secondary">
              Click a node to inspect it. Connected nodes stay highlighted.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-widest text-accent">
                {selectedNode.label}
              </p>
              <p className="font-medium text-text-primary">{selectedNode.name}</p>
              {selectedNode.sector && (
                <p className="text-xs text-text-secondary">Sector: {selectedNode.sector}</p>
              )}
              {selectedNode.detail &&
                Object.entries(selectedNode.detail).map(([key, value]) => (
                  <p key={key} className="text-xs text-text-secondary">
                    {humanizeKey(key)}: {formatDetailValue(key, value)}
                  </p>
                ))}
              {detailLink(selectedNode) && (
                <Link
                  href={detailLink(selectedNode)!}
                  className="mt-2 inline-block text-xs text-accent hover:underline"
                >
                  Open detail →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
