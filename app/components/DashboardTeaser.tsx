"use client";

import { motion } from "framer-motion";

const ROWS = [
  { name: "Drainage overflow — Hosakote", score: 0.92, color: "#dc2626" },
  { name: "School overcrowding — Dodda Ballapur", score: 0.78, color: "var(--accent)" },
  { name: "Street lighting — Devanahalli", score: 0.54, color: "var(--accent)" },
];

export function DashboardTeaser() {
  return (
    <div className="w-full max-w-md rounded-2xl bg-bg-elevated p-5 shadow-[var(--shadow-elevated)]">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-accent">
          Ranked issue themes
        </p>
        <span className="text-xs text-text-secondary">live preview</span>
      </div>
      <div className="space-y-3">
        {ROWS.map((row, i) => (
          <motion.div
            key={row.name}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 * i, duration: 0.4 }}
          >
            <div className="flex justify-between text-xs text-text-secondary">
              <span>{row.name}</span>
              <span>{row.score.toFixed(2)}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-bg-secondary">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${row.score * 100}%` }}
                transition={{ delay: 0.15 * i + 0.2, duration: 0.6, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ backgroundColor: row.color }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
