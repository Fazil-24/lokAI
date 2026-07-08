# LokAI — AI Copilot for People-First Constituency Development Planning

LokAI turns messy citizen input (text, photo, or voice, in any language) into structured civic
intelligence, links it into a knowledge graph alongside real government works data, demographic
indicators, and scheme rules, and helps an MP or constituency officer compare competing
development projects using a transparent priority score, a trade-off simulator, and scheme-
eligibility checks.

**LokAI is not an autonomous decision-maker.** Every score shown in the UI traces back to a real,
inspectable computation — a pure function in [`lib/scoring.ts`](lib/scoring.ts) or a Cypher query —
never an LLM-invented number. The only two jobs an LLM is ever allowed to do (enforced in
[`lib/reason.ts`](lib/reason.ts)) are: (1) extract structured fields from messy input, and
(2) narrate/explain a score the code already computed.

## Tech stack

Single Next.js 14 (App Router) + TypeScript app, deployable as one Vercel project — no separate
backend service.

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript, Tailwind CSS |
| Animation | Framer Motion |
| Graph DB | Neo4j Aura Free |
| Map | Leaflet + OpenStreetMap tiles |
| Charts | Recharts |
| Media storage | Local demo-mode (base64 data URLs stored on the `Submission` node — see [`lib/media.ts`](lib/media.ts)) |
| LLMs | Cerebras (primary, text), Gemini (fallback + multimodal) via [`lib/reason.ts`](lib/reason.ts) |
| Auth | Signed-cookie admin session for `/admin` (see [`lib/adminAuth.ts`](lib/adminAuth.ts)); `/submit` has zero auth friction |

Real data: 222 MPLADS works for the Chikballapur Lok Sabha constituency, Karnataka
(`data/chikballapur_mplads_seed.csv`), plus a handful of cited Census 2011 indicators. See
[`files/lokai-claude-code-prompt.md`](files/lokai-claude-code-prompt.md) for the full data-honesty
notes (e.g. every CSV row is `Unsanctioned` in real life — mapped to
`"MP-Recommended (Pending District Sanction)"`, never relabeled).

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables** — copy `.env.example` to `.env.local` and fill in real
   values (see [Environment variables](#environment-variables) below).

   ```bash
   cp .env.example .env.local
   ```

3. **Seed the database** — idempotent (`MERGE`, never `CREATE`), safe to re-run any time:

   ```bash
   npm run seed
   ```

4. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Try `/submit` once, then check the Aura
   console's **Query** tab to confirm a `Submission` node was actually written.

5. **Run tests / type-check**

   ```bash
   npm test        # vitest — pure-function unit tests (lib/scoring.ts, lib/schemeRules.ts)
   npx tsc --noEmit
   npm run lint
   ```

## Environment variables

All secrets are read from `process.env` — nothing is hardcoded. See `.env.example` for the exact
names.

| Variable | Purpose |
|---|---|
| `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` | Neo4j Aura Free connection. Aura Free instances cold-start after inactivity (30–60s) — `/api/health` pings connectivity so the wake-up starts as soon as a judge opens the site. |
| `CEREBRAS_API_KEY`, `CEREBRAS_MODEL` | Primary text reasoning/explanation provider (low latency, fires on every UI click). |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Multimodal (photo/audio) extraction, and automatic fallback if Cerebras errors. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Optional — not currently wired in. Media is stored as base64 data URLs on the `Submission` node for demo simplicity; swap in Supabase Storage later without touching the API contract. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Credentials for `/admin/login`; `ADMIN_PASSWORD` also signs the admin session cookie (see `lib/adminAuth.ts`). |

## Architecture notes

- `lib/` holds every pure/service module (scoring, scheme rules, Neo4j client, LLM routing,
  graph snapshot). `app/api/` holds thin route handlers that call into `lib/`.
- `lib/scoring.ts` — pure, unit-tested, no I/O. `priority_score = w1·demand + w2·urgency +
  w3·demographicGap + w4·schemeFit − w6·overlapPenalty + w5·equity`. Weights are admin-adjustable
  sliders in the dashboard, never learned.
- `lib/schemeRules.ts` — deterministic GREEN/AMBER/RED feasibility checks against MPLADS-style
  rules, no LLM judgment involved.
- `lib/reason.ts` — the only place an LLM is ever called; routes text to Cerebras with automatic
  Gemini fallback, and multimodal (photo/audio) straight to Gemini. Logs every call (provider,
  latency, success) to an in-memory `providerLog`, exposed at `GET /api/llm-health`.
- "Connected Impact" (`lib/connectedImpact.ts`, `GET /api/projects/[id]/connected-impact`) is an
  honest 2-hop Cypher traversal from a selected project — never called a "simulation" or
  "prediction" in UI copy, because it isn't one.
- `GET /api/graph` (`lib/graphSnapshot.ts`) returns a flattened node/edge snapshot of the priority
  graph (issue themes, project options, locations, scheme rules, overlapping sanctioned works),
  cached in-memory for 15s so the dashboard doesn't hammer Aura on every paint. Rendered client-side
  in `app/components/PriorityGraphView.tsx` with a small self-contained force-directed SVG layout
  (no d3 dependency) — click any node to inspect it and highlight its direct connections.

## API routes

| Route | Purpose |
|---|---|
| `POST /api/ingest` | Citizen intake — LLM-extracts structured fields, writes a `Submission`, matches/creates an `IssueTheme`. |
| `POST /api/upload` | Converts an uploaded photo/audio file to a base64 data URL (demo-mode storage). |
| `GET /api/themes`, `GET /api/themes/[id]` | Ranked theme list / theme detail (submissions, overlaps, LLM-generated candidate projects). |
| `GET /api/map` | Location + demand-heatmap data. |
| `GET /api/graph` | Priority graph snapshot (nodes + edges). Add `?refresh=1` to bypass the cache. |
| `GET /api/projects`, `GET /api/projects/[id]` | Project option listing/detail. |
| `GET /api/projects/[id]/connected-impact` | 2-hop Cypher traversal from a project. |
| `POST /api/simulate` | Trade-off comparison for up to 3 selected projects. |
| `GET /api/scheme-check/[projectId]` | Rule-by-rule feasibility check. |
| `GET /api/dashboard-summary` | Top-widget counts for the officer dashboard. |
| `GET /api/health` | Neo4j connectivity check. |
| `GET /api/llm-health` | Cerebras/Gemini configured status + recent provider call log. |
| `POST /api/demo-reset` | **Admin-only, destructive.** Deletes all citizen-generated data (submissions, issue themes, generated project options) and re-applies the real MPLADS/Census/scheme-rule base seed. |
| `POST /api/admin-login`, `POST /api/admin-logout` | Admin session cookie. |

## Deploying to Vercel

1. Push to GitHub, then in Vercel: **Add New → Project** → import the repo.
2. In **Environment Variables**, add every variable listed above (Vercel does not read
   `.env.local` from the repo — re-enter them in the dashboard).
3. Deploy.
4. **Before a judging/demo slot:**
   - Open the deployed URL once yourself to warm the Neo4j Aura instance.
   - Click through the citizen flow (`/submit`) and the officer flow (`/admin`) once to confirm
     env vars made it into the Vercel dashboard correctly.
   - Call `POST /api/demo-reset` (as a signed-in admin) to return the graph to a clean state
     regardless of what was clicked during testing.

## Project structure

```
app/
  (citizen)/submit/      # zero-auth-friction citizen intake portal
  (admin)/admin/         # officer dashboard, theme detail, trade-off simulator, graph view
  api/                   # route handlers — thin, delegate to lib/
  components/            # shared client components (map, graph, connected-impact panel)
lib/                     # pure services: scoring, scheme rules, Neo4j client, LLM routing, seeding
scripts/seed.ts          # CLI wrapper around lib/seedBaseData.ts
data/                    # the real MPLADS CSV committed to the repo
files/                   # original build brief + setup guide (reference only)
```
