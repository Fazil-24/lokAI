# LokAI — Claude Code Build Prompt
### AI Copilot for People-First Constituency Development Planning

*(This entire document is designed to be pasted directly into Claude Code as the starting prompt.)*

---

## ROLE AND GOAL

You are an expert full-stack engineer and product designer. Build **LokAI**, a hackathon-ready but production-quality web platform for the "People's Priorities — AI for Constituency Development Planning" challenge.

**Core idea:** Citizens submit development needs via text, voice, or photo, in any language. LokAI converts messy public input into structured civic intelligence, links it into a knowledge graph alongside real government works data, demographic indicators, and scheme rules, and helps an MP or constituency officer compare competing development projects using a transparent priority score, a trade-off simulator, and scheme-eligibility checks.

**LokAI is NOT an autonomous decision-maker. It is an explainable decision-assistance tool.** Every score the UI shows must trace back to a real, inspectable computation — never an LLM-invented number. The LLM's only jobs are (1) extracting structured fields from messy input and (2) narrating/explaining a score that the code already computed. This constraint must be true in the code, not just in the pitch — enforce it architecturally (see Section 5).

---

## 1. Tech stack (single-app architecture — this matters for demo reliability)

Build this as **one Next.js 14 (App Router) + TypeScript app**, deployable as a single Vercel project. Do not split into a separate FastAPI backend — every extra service is a place a judge's live demo can break. Use Next.js API routes for all backend logic.

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router), TypeScript, Tailwind CSS | Single deployable unit on Vercel |
| Animation | Framer Motion | `layoutId` for rerank animations, page/theme transitions |
| Graph DB | Neo4j Aura Free | Real Cypher traversal — this is the actual intelligence layer, defensible under Q&A |
| Graph viz | Cached JSON snapshot regenerated on writes, rendered with a lightweight custom SVG/D3 graph view | Keeps the UI fast even if Aura cold-starts |
| Map | Leaflet + OpenStreetMap tiles, custom GeoJSON ward-grid (see Section 9) | No Mapbox key dependency, no missing-shapefile risk |
| Charts | Recharts | Issue recurrence, comparison bars, score breakdown |
| Media storage |( local `/public/uploads` for hackathon demo mode) | Client uploads directly via signed URL, never proxied through an API route (Vercel body size limits) | keep a placeholder for supabase (later we can think about this)
| LLMs | Cerebras (primary), Gemini (fallback + multimodal) | Unified `lib/reason.ts` abstraction, see Section 4 |
| Auth | Simple hardcoded/env-based admin login (NextAuth optional) for `/admin`; citizen portal `/submit` has zero auth friction | |
| Hosting | Vercel free tier | |

**Vercel free-tier constraints to respect:**
- Serverless function timeout ~10s on Hobby — never block a request on a long LLM chain; stream responses or return immediately and let the client poll/subscribe for the narration text.
- No persistent in-memory state across invocations — instantiate the Neo4j driver as a per-request singleton (module-level client reused across warm invocations, reconnect on cold start).
- 4.5MB request body limit — citizen media uploads go directly to storage via signed URL, not through a Next.js API route.

---

## 2. Data model (Neo4j graph schema)

**Nodes:**
- `(:Submission {id, type[text|photo|voice], rawText, translatedText, language, mediaUrl, submitterName, submitterContact, constituencyNumber, urgencySignal, timestamp, status})`
- `(:IssueTheme {id, name, sector, description, submissionCount})` — a clustered recurring need
- `(:ProjectOption {id, name, sector, estimatedCost, status[proposed|sanctioned|ongoing|completed|illustrative], source[citizen-derived|dev-plan|MPLADS|illustrative]})`
- `(:Location {id, name, type[ward|block|village], population, literacyRate})`
- `(:Sector {id, name})` — roads, water, lighting, community, health, education, other
- `(:PublicIndicator {id, location, metric, value, year, source})`
- `(:SchemeRule {id, name, eligibilityCriteria, coFundingPercent, sourceUrl})`
- `(:SanctionedWork {id, workName, description, amount, agency, dateRecommended, source:"MPLADS"})`
- `(:Constituency {id, name, state})`

**Relationships:**
- `(:Submission)-[:SUBMITTED_IN]->(:Location)`
- `(:Submission)-[:MENTIONS_ISSUE]->(:IssueTheme)`
- `(:IssueTheme)-[:AFFECTS_LOCATION]->(:Location)`
- `(:IssueTheme)-[:SUGGESTS]->(:ProjectOption)`
- `(:ProjectOption)-[:AFFECTS_LOCATION]->(:Location)`
- `(:ProjectOption)-[:IMPROVES]->(:PublicIndicator)`
- `(:ProjectOption)-[:PERMITTED_BY]->(:SchemeRule)`
- `(:ProjectOption)-[:OVERLAPS_WITH_WORK]->(:SanctionedWork)` — the budget-duplication catch
- `(:ProjectOption)-[:TRADEOFF_WITH]->(:ProjectOption)`
- `(:Location)-[:ADJACENT_TO]->(:Location)` — enables second-order spillover reasoning
- `(:Location)-[:PART_OF_CONSTITUENCY]->(:Constituency)`

This schema is richly connected enough that a 2-hop Cypher traversal from any selected `ProjectOption` produces a genuinely non-obvious "Connected Impact" result (see Section 7).

---

## 3. Real dataset to seed (do not fabricate data where real data is specified)

**Source file (included, use as-is):** `chikballapur_mplads_seed.csv` — 222 real MPLADS works for the **Chikballapur Lok Sabha constituency, Karnataka** (includes Dodda Ballapur block). Schema, semicolon-delimited:

```
MP NAME;WORK;CATEGORY;STATE;CONSTITUENCY;IDA;CITY;WARD;BLOCK;VILLAGE;RECOMMENDED DATE;ALLOCATION AMOUNT;IDA APPROVAL;STATUS;HOUSE
```

**Two honest facts about this real data — encode them accurately, do not paper over them:**
1. Every row's `STATUS` is `Unsanctioned` and `CATEGORY` is `Normal/Others` — this dataset captures MP-recommended works pending district approval, not full lifecycle status. Map this to `SanctionedWork.status = "MP-Recommended (Pending District Sanction)"`. If the demo needs lifecycle variety (ongoing/completed projects), add a small number of clearly separate synthetic `ProjectOption` nodes tagged `source: "illustrative"` — never relabel real MPLADS rows with invented statuses.
2. `WORK` is free text (e.g. "NA - Construction of roads, approach roads, link roads and pathways"). Derive `Sector` via keyword mapping, not the `CATEGORY` column:

```ts
const SECTOR_KEYWORDS: Record<string, RegExp> = {
  roads: /road|pathway|approach road/i,
  lighting: /lighting|street light/i,
  water: /drain|gutter|water|drinking water/i,
  community: /community center|community hall|boundary wall/i,
  health: /semen bank|health|hospital/i,
};
function deriveSector(work: string): string {
  for (const [sector, re] of Object.entries(SECTOR_KEYWORDS)) {
    if (re.test(work)) return sector;
  }
  return "other";
}
```

Treat `BLOCK`/`VILLAGE` as your `Location` granularity (this dataset has no formal ward numbers). Major blocks present: Hoskote/Hosakote (~122 rows), Devanhalli (37), Dodda Ballapur (35), Chikballapur town (18), plus small counts elsewhere.

**Seed script (`scripts/seed.ts`):** read the local CSV (commit it to the repo, don't fetch at runtime), write via idempotent `MERGE` Cypher (never `CREATE`) so re-running the seed is always safe — this matters because you'll re-seed before every demo run.

**Demographic indicators:** pull 3-4 real figures for Chikballapur/Dodda Ballapur (school enrollment, literacy rate, sanitation coverage) from Dataful collection 589 or dataset 22567. Keep the number of indicators small and cite the source in a UI tooltip — a handful of real numbers beats a dozen invented ones.

---

## 4. LLM routing layer

Build one module: `lib/reason.ts`

```ts
type ReasonRequest = {
  prompt: string;
  mode: "explain" | "extract" | "cluster";
  multimodal?: { imageUrl?: string; audioUrl?: string };
};

async function reason(req: ReasonRequest): Promise<string> {
  if (req.multimodal) return callGemini(req); // image/audio always routes to Gemini
  try {
    return await callCerebras(req); // fast text-only reasoning/explanation
  } catch (err) {
    return await callGemini(req); // fallback on 429/5xx
  }
}
```

- **Cerebras** (`CEREBRAS_API_KEY`, GPT OSS 120B): priority-score explanations, theme-cluster naming, Connected Impact narration. Low latency matters — these fire on every UI click.
- **Gemini** (`GEMINI_API_KEY`, gemini-3.1-flash-lite): photo classification (e.g. pothole photo → infra category + severity estimate), audio transcription + translation to English (store both original and translated text), and text fallback when Cerebras errors. if the gemini credits run out or exhausted, then use cerebras (Gemma 4 31B)
- Log which provider served each request in a small in-memory/DB `providerLog` — this is your "no single point of failure on inference" talking point.

**Hard architectural guardrail:** `reason()` must only ever be called to (a) extract structured JSON fields from raw input, or (b) generate natural-language explanation text for a score/number the scoring service already computed and passed in as context. Never let an LLM call return a priority score, a metric value, or a ranking directly — those come only from `lib/scoring.ts` (Section 5) and Cypher queries.

---

## 5. Scoring formula (transparent, inspectable, no LLM involved)

Implement as a pure function in `lib/scoring.ts`:

```
priority_score(project) =
    w1 * normalized(demand_volume)      // count of linked submissions/themes
  + w2 * normalized(urgency_signal)     // recurrence + severity signals
  + w3 * normalized(demographic_gap)    // e.g. enrollment/capacity ratio
  + w4 * scheme_fit_bonus               // 1 if PERMITTED_BY a scheme, scaled by co-funding %
  + w5 * equity_weight                  // boosts locations with fewer existing sanctioned works
  - w6 * overlap_penalty                // if OVERLAPS_WITH_WORK an existing SanctionedWork
```

Expose `w1..w6` as **admin-adjustable sliders** in the dashboard ("demand-driven vs equity-driven vs scheme-fit-driven"). This is a strong feature: it shows the tool adapts to different officer philosophies without retraining anything, and visibly proves the human sets the values while the system just computes.

After the score is computed, pass the actual feature values into `reason()` with `mode: "explain"` to generate a 2-3 sentence natural-language explanation that cites the real numbers (e.g., "Ranked #1 primarily due to 34 recurring submissions from Dodda Ballapur and a 91% school capacity overrun; also eligible for [SchemeRule] co-funding").

---

## 6. Scheme-aware feasibility check

Implement as deterministic rules in `lib/schemeRules.ts`, not LLM judgment:

```
GREEN  = compliant (all criteria met)
AMBER  = partially compliant / needs coordination
RED    = likely not suitable
```

Seed 3-5 realistic `SchemeRule` nodes inspired by MPLADS-style durable-public-asset logic (e.g. minimum SC/ST allocation percentage, durable-asset requirement, per-project cost ceiling). Show machine-readable rule explanations alongside the color, e.g. "Meets durable-asset requirement; falls short of 15% SC-area allocation guideline — Amber."

---

## 7. "Connected Impact" — second-order graph traversal (NOT "butterfly effect")

**Naming matters here — use "Connected Impact" or "What Else This Touches" in all UI copy, never "butterfly effect," "prediction," or "simulation of consequences."** The feature is honest graph reachability, and the UI language must match exactly what it does, so it stays defensible under judge questioning.

Implementation — one Cypher query, 2 hops from a selected `ProjectOption`:

```cypher
MATCH (p:ProjectOption {id: $projectId})-[r1]-(n1)-[r2]-(n2)
WHERE n1 <> p AND n2 <> p
RETURN p, r1, n1, r2, n2
```

Categorize results by node type (Location, PublicIndicator, other ProjectOption, SchemeRule, SanctionedWork) and render as an expanding ripple animation — nodes light up in waves by hop distance, ~400ms per hop.

---

## 8. App sections and pages

### Landing Page (`/`)
Hero introducing LokAI, tagline "AI Copilot for People-First Constituency Planning," two buttons ("Submit a civic need" → `/submit`, "Explore officer demo" → `/admin`), brief 3-step how-it-works, visual teaser screenshot/animation of the dashboard.

### Citizen Intake Portal (`/submit`) — zero auth friction
Fields: full name, phone/email, constituency number (selector, pre-populated with Chikballapur for the demo), message textbox, upload area (drag-and-drop, supports document/photo/audio with preview), optional language selector.
Flow: on submit → upload media to storage → `/api/ingest` → Gemini extracts `{issueTheme, location, urgency, affectedGroup, inferredAsset, summary, confidence, tags}` as structured JSON → write `Submission` node → match against existing `IssueTheme` (keyword/embedding similarity) or create new theme → confirmation screen with tracking ID.
Keep this page calm, simple, accessible, mobile-friendly, feather-white themed, minimal animation — this is for citizens, not for wow-factor.

### Officer/Admin Dashboard (`/admin`) — auth required
Three-column layout: left = ranked issue themes + weight sliders; center = constituency map with heatmap; right = explainability/reasoning panel.
Top widgets: recurring issues count, ongoing works summary, submission volume, affected-population estimate, scheme-compatible project count.

### Theme Detail View
On selecting an issue cluster: theme summary, submission count, related locations, related existing assets, `OVERLAPS_WITH_WORK` overlap with sanctioned works, mini priority-graph visualization, candidate `ProjectOption` list (2-3 generated per theme via `reason()` extract mode, grounded in real graph context — never invented from nothing).

### Trade-off Simulator
Compare up to 3 `ProjectOption`s side by side: description, impacted locations, directional impact indicators (no invented precise numbers — phrase as "likely to reduce X, based on Y dataset"), beneficiary estimate, budget band, scheme compatibility, "why recommended." Selecting one project triggers: heatmap update, priority rerank animation, Connected Impact ripple, explanation panel narrating downstream effects and remaining unmet needs.

### Project Feasibility / Scheme Check
Green/Amber/Red per `SchemeRule`, with the machine-readable rule explanation text shown alongside.

---

## 9. Maps and visuals

- Leaflet + OSM tiles, constituency outline, block/village overlay (stylized grid/choropleth by `Location` if real GeoJSON boundaries aren't available at this resolution — do not block the build on missing shapefiles).
- Hotspot heatmap layer (demand density by location), project-impact overlay, legend + layer toggle.
- Charts (Recharts): issue recurrence by theme, affected population by location, project comparison bars, compliance status indicator.
- Graph view: custom lightweight SVG/D3 interactive priority graph, colored nodes by category, click to inspect evidence, animated path highlighting for Connected Impact.

---

## 10. Theming

**Light theme — "Porcelain Mist"**
```css
--bg-primary: #F0E6D0;
--bg-secondary: #E5D6B8;
--bg-elevated: #FFFFFF;
--accent: #C1AF8B;
--text-primary: #2A2419;
--border: rgba(193, 175, 139, 0.35);
```
`#FFFFFF` for cards/panels floating above the `#F0E6D0` base, `#E5D6B8` for secondary surfaces (sidebars, table headers), `#C1AF8B` as the single accent for active states, rank badges, and graph edge highlights. Soft shadows (`box-shadow: 0 2px 12px rgba(193,175,139,0.15)`), not hard borders.

**Dark theme:** deep warm charcoal (`#16150F`), same `#C1AF8B`-family accent brightened for contrast (e.g. `#D4C39E`). Elevated cards with subtle border glow, strong contrast for readability.

**Motion:**
- Priority list re-ranks: Framer Motion `layoutId` so cards visibly slide to new positions, never jump-cut.
- Score reveal: stacked bar segments animate in sequentially, 100-150ms stagger per factor.
- Connected Impact ripple: expanding radial fade per hop, ~400ms per hop.
- Theme toggle: smooth crossfade, not an instant flash.
- Perceived click-to-response latency under ~600ms — start the animation optimistically, backfill LLM explanation text as it streams in.

---

## 11. Demo scenarios to pre-seed (all three, end to end)

1. **School overcrowding vs vocational centre** — demand-volume + demographic-gap driven ranking beats a scheme-fit-only alternative; shows the trade-off explicitly.
2. **Recurring drainage complaints vs a paper road project** — urgency/recurrence beats an "already planned" project; Connected Impact shows spillover to a market area and a school route.
3. **The overlap catch** — a high-demand project flagged by `OVERLAPS_WITH_WORK` against a real MPLADS-sanctioned work already in the CSV. The UI surfaces: "This may duplicate [SanctionedWork name], recommended [date], ₹[amount]." This is the strongest judge moment — the system catching something a busy human would miss, using real government data.

Pre-seed all three so the demo doesn't depend on live LLM calls behaving perfectly on judge wifi. Cache expected explanation text as a fallback if a live call is slow/fails, while still attempting the live call first (progressive enhancement, not a fake demo).

---

## 12. APIs to implement (Next.js route handlers)

- `POST /api/submissions` — citizen intake
- `POST /api/upload` — signed URL generation for media
- `GET /api/themes` / `GET /api/themes/[id]` — theme listing/detail
- `GET /api/map` — location + heatmap data
- `GET /api/graph` — priority graph snapshot
- `GET /api/projects` / `GET /api/projects/[id]` — project options
- `POST /api/simulate` — trade-off simulation for selected project(s)
- `GET /api/scheme-check/[projectId]` — feasibility check
- `GET /api/dashboard-summary` — top widgets
- `GET /api/llm-health` — provider status (Cerebras/Gemini)
- `POST /api/demo-reset` — reseed demo data

---

## 13. Engineering requirements

- Clean architecture: `lib/` for pure services (scoring, schemeRules, reason, neo4j client), `app/api/` for route handlers, `app/(citizen)/submit`, `app/(admin)/admin` for pages.
- Full environment-variable-driven config (see `.env.example` below) — no hardcoded secrets.
- Graceful fallback if Cerebras fails (auto-route to Gemini, surface in `providerLog`).
- Loading states and empty states everywhere — a judge should never see a raw error or blank white screen.
- `scripts/seed.ts` idempotent seed script using the included CSV.
- README with local run instructions, env var docs, and Vercel deployment steps.
- No placeholder/TODO comments in delivered code — but prioritize the build order below over exhaustive scope; a polished 80% is better than an unfinished 100%.

**Build order (do not reorder without reason):**
1. Scaffold Next.js + Tailwind + theme tokens, both themes wired to a toggle.
2. Neo4j Aura connection + schema creation + seed script from the CSV.
3. Citizen portal + `/api/submissions` with Gemini extraction (text → photo → voice, in that order).
4. `lib/scoring.ts` — pure function, no LLM, unit-testable.
5. Admin dashboard: priority list + weight sliders (no map yet) — validate rerank animation first.
6. Map/heatmap integration.
7. Project detail panel: score breakdown, scheme check, trade-off comparison.
8. Connected Impact panel + Cypher traversal.
9. `lib/reason.ts` wiring (Cerebras + Gemini fallback) for narration.
10. Seed the 3 demo scenarios end to end, polish animation and dark theme.

---

## 14. Jury positioning notes (for you to say, not to build)

- "Every number on this screen traces back to a Cypher query or a dataset row you can click through — nothing is a black-box LLM guess."
- "The LLM's only job is to explain and extract, never to decide the score."
- "We used real MPLADS data for Chikballapur constituency, Karnataka — this isn't synthetic."
- Mention (don't demo) designed-but-unshown depth: deeper economic modeling, multi-constituency comparison, longitudinal theme-resolution tracking over time.
