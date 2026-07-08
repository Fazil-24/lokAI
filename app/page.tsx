import Link from "next/link";
import { DashboardTeaser } from "@/app/components/DashboardTeaser";

const STEPS = [
  {
    title: "Citizens report",
    body: "Text, photo, or voice — in any language. No login required.",
  },
  {
    title: "AI structures it",
    body: "Messy input becomes a structured need, linked into a knowledge graph alongside real government works data.",
  },
  {
    title: "Officers decide",
    body: "Compare, prioritize, and check scheme eligibility with a transparent score — never a black-box number.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-3xl text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-accent">
          AI Copilot for People-First Constituency Planning
        </p>
        <h1 className="mt-3 text-4xl font-semibold text-text-primary sm:text-5xl">
          LokAI
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-text-secondary">
          Turns messy public input into transparent civic intelligence — linked to real government
          works data, demographic indicators, and scheme rules — so an officer can compare
          competing development priorities with a score they can actually inspect.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/submit"
            className="w-full rounded-full bg-accent px-6 py-3 font-medium text-accent-foreground transition-opacity hover:opacity-90 sm:w-auto"
          >
            Submit a civic need
          </Link>
          <Link
            href="/admin"
            className="w-full rounded-full border border-[var(--border)] px-6 py-3 font-medium text-text-primary transition-colors hover:bg-bg-secondary sm:w-auto"
          >
            Explore officer demo
          </Link>
        </div>
      </div>

      <div className="mt-16 grid w-full max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className="rounded-2xl bg-bg-elevated p-5 shadow-[var(--shadow-elevated)]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
              {i + 1}
            </span>
            <p className="mt-3 font-medium text-text-primary">{step.title}</p>
            <p className="mt-1 text-sm text-text-secondary">{step.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-16 flex w-full max-w-4xl flex-col items-center gap-4">
        <p className="text-sm text-text-secondary">
          Every number traces back to a Cypher query or a dataset row — nothing is a black-box LLM
          guess.
        </p>
        <DashboardTeaser />
      </div>
    </main>
  );
}
