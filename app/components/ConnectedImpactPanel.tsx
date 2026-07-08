"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ImpactNode {
  id: string;
  label: string;
  name: string;
  hop: 1 | 2;
  relType: string;
  parentId: string;
}

const LABEL_ICON: Record<string, string> = {
  Location: "📍",
  PublicIndicator: "📊",
  ProjectOption: "🏗️",
  SchemeRule: "📜",
  SanctionedWork: "🧱",
  IssueTheme: "🗂️",
  Submission: "📝",
  Sector: "🏷️",
  Constituency: "🏛️",
};

function humanizeRel(relType: string): string {
  return relType
    .toLowerCase()
    .split("_")
    .join(" ");
}

export function ConnectedImpactPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hop1, setHop1] = useState<ImpactNode[]>([]);
  const [hop2, setHop2] = useState<ImpactNode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const loading = open && !loaded && !error;

  useEffect(() => {
    if (!open || loaded) return;
    fetch(`/api/projects/${projectId}/connected-impact`)
      .then((res) => res.json())
      .then((data) => {
        setHop1(data.hop1 ?? []);
        setHop2(data.hop2 ?? []);
        setLoaded(true);
      })
      .catch(() => setError("Couldn't load connected impact"));
  }, [open, loaded, projectId]);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-accent hover:underline"
      >
        {open ? "Hide" : "What else this touches →"}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-lg border border-[var(--border)] bg-bg-secondary p-3">
              {loading && <p className="text-xs text-text-secondary">Tracing connections…</p>}
              {error && <p className="text-xs text-red-500">{error}</p>}
              {loaded && hop1.length === 0 && (
                <p className="text-xs text-text-secondary">
                  No directly connected records found for this project yet.
                </p>
              )}

              {loaded && hop1.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-text-secondary">
                      Directly connected
                    </p>
                    <ul className="mt-1 space-y-1">
                      {hop1.map((node, i) => (
                        <motion.li
                          key={node.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.06, duration: 0.3 }}
                          className="flex items-center gap-2 text-sm text-text-primary"
                        >
                          <span>{LABEL_ICON[node.label] ?? "•"}</span>
                          <span>{node.name}</span>
                          <span className="text-xs text-text-secondary">
                            ({humanizeRel(node.relType)})
                          </span>
                        </motion.li>
                      ))}
                    </ul>
                  </div>

                  {hop2.length > 0 && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-text-secondary">
                        Two hops out
                      </p>
                      <ul className="mt-1 space-y-1">
                        {hop2.map((node, i) => (
                          <motion.li
                            key={node.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.4 + i * 0.06, duration: 0.3 }}
                            className="flex items-center gap-2 text-sm text-text-secondary"
                          >
                            <span>{LABEL_ICON[node.label] ?? "•"}</span>
                            <span>{node.name}</span>
                            <span className="text-xs text-text-secondary/70">
                              ({humanizeRel(node.relType)})
                            </span>
                          </motion.li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
