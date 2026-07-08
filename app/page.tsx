export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="rounded-2xl bg-bg-elevated px-10 py-8 text-center shadow-[var(--shadow-elevated)]">
        <p className="text-sm font-medium uppercase tracking-widest text-accent">
          Hackathon build in progress
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-text-primary">
          LokAI
        </h1>
        <p className="mt-2 max-w-md text-text-secondary">
          AI Copilot for People-First Constituency Development Planning
        </p>
      </div>
    </main>
  );
}
