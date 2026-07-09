# LokAI — Decision Assistance Autonomous System for People-First Constituency Development Planning

LokAI turns messy citizen input (text, photo, or voice, in any language) into structured civic
intelligence, links it into a knowledge graph alongside real government works data (considering the example of Karnataka constituency), demographic
indicators, scheme rules, and helps an MP or constituency officer compare competing
development projects using a transparent priority score, a trade-off simulator, and a scheme
eligibility checks.

**LokAI is not an autonomous decision-maker.** Every score shown in the UI traces back to a real,
inspectable computation — a pure function in [`lib/scoring.ts`](lib/scoring.ts) or a Cypher query —
never an LLM-invented number. The only two jobs an LLM is ever allowed to do (enforced in
[`lib/reason.ts`](lib/reason.ts)) are: (1) extract structured fields from messy input, and
(2) narrate/explain a score the code already computed.


## Deployed link and demo video 
https://lok-ai.vercel.app/ (use these credentials for demo: admin username: admin@lokai.demo and admin password: admin123

video - https://youtu.be/vpcm0gkTEwU

## Architecture

<img width="647" height="379" alt="GenAI Chat App for Women Entrepreneurs – Using AWS Bedrock and Flask - visual selection (4)" src="https://github.com/user-attachments/assets/a1f31c09-9cac-4117-ae4c-76404b354d65" />


1.	Citizen submits — text, voice, or photo, no login, via the intake portal.
2.	Extraction — Gemini (multimodal) pulls structured fields from the raw input: issue theme, location, urgency, affected group, summary.
3.	Graph write — the submission is matched against existing recurring themes (or a new one is created) and written into Neo4j alongside real Location, Sector, Scheme, and SanctionedWork nodes.
4.	Scoring — a deterministic formula (code, not AI) computes a priority score from graph features: demand volume, urgency, demographic gap, scheme fit, equity.
5.	Officer dashboard — queries the graph directly: ranked list, heatmap, project detail.
6.	Officer selects a project — triggers two things in parallel: the trade-off simulator (compares up to 3 projects) and the scheme-eligibility check (deterministic Green/Amber/Red rules).
7.	Connected Impact — a live 2-hop Cypher traversal runs from the selected project, surfacing what else it touches.
8.	Reasoning layer — Cerebras (fallback: Gemini) narrates the score and impact in plain language, grounded only in the values already computed in steps 4–7 — never inventing a number of its own.
9.	Officer acts — LokAI has assisted, not decided; the human makes the call.


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
(`data/chikballapur_mplads_seed.csv`), plus a handful of cited Census 2011 indicators. (https://dataful.in/collections/589/)

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
| `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` | Neo4j Aura Free connection.|
| `CEREBRAS_API_KEY`, `CEREBRAS_MODEL` | Primary text reasoning/explanation provider (low latency, fires on every UI click). |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Multimodal (photo/audio) extraction and automatic fallback if Cerebras errors. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Credentials for `/admin/login`; `ADMIN_PASSWORD` also signs the admin session cookie. |



