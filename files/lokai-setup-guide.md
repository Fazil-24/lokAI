# LokAI — Setup Guide (Neo4j, Cerebras, Gemini, Deployment)

Do these steps *before* or *alongside* handing the build prompt to Claude Code — Claude Code will write code that expects these to exist as environment variables.

---

## 1. Neo4j Aura (free tier)

1. Go to https://neo4j.com/cloud/aura-free/ and sign up (or log in with GitHub/Google).
2. Click **Create Instance** → choose **AuraDB Free**.
3. Give it a name (e.g. `lokai-demo`). Click **Create**.
4. **Important:** Aura shows you the password/connection details exactly once, on a screen with a "Download credentials" button. Download it now — you cannot retrieve the password later without resetting it.
5. You'll get three values you need:
   - `NEO4J_URI` — looks like `neo4j+s://xxxxxxxx.databases.neo4j.io`
   - `NEO4J_USERNAME` — usually `neo4j`
   - `NEO4J_PASSWORD` — the generated password
6. Wait ~1-2 minutes for the instance status to show **Running** (it starts in a "Creating" state).
7. **Cold-start behavior to know:** Aura Free instances pause after a period of inactivity and take 30-60 seconds to wake up on the next query. Two things to do about this:
   - Right before your demo/judging slot, open the app and click through once to "wake" the instance.
   - Ask Claude Code to add a lightweight `/api/health` route that pings Neo4j on app load, so the wake-up happens as soon as a judge opens the site, not on their first real click.
8. You can browse/query your graph directly anytime at the Aura console's **Query** tab (useful for sanity-checking the seed script worked before you touch the frontend).

---

## 2. Cerebras API

1. Go to https://cloud.cerebras.ai and sign up.
2. Once logged in, go to **API Keys** in the dashboard.
3. Click **Create API Key**, give it a name (e.g. `lokai-hackathon`), copy the key immediately (shown once).
4. Note the model name you'll use — Claude Code's brief specifies Llama 3.3-70B; confirm the exact model string available on Cerebras's free tier from their dashboard/docs (model names occasionally change), and pass that string into `lib/reason.ts`.
5. Save as `CEREBRAS_API_KEY` in your `.env`.

---

## 3. Gemini API (Google AI Studio)

1. Go to https://aistudio.google.com/app/apikey.
2. Sign in with your Google account.
3. Click **Create API Key** → select or create a Google Cloud project when prompted (free tier doesn't require billing to be enabled for Gemini's free quota, but Google may still ask you to acknowledge a project).
4. Copy the generated key.
5. Save as `GEMINI_API_KEY` in your `.env`.
6. Confirm the current free-tier model name for multimodal (image + audio) input in AI Studio's model picker — Gemini 2.0 Flash is the free-tier multimodal model as of early 2026, but check the dashboard directly since Google updates model availability.

---

## 4. Media storage (Supabase, free tier) — optional but recommended

If you want real upload handling rather than local demo-mode storage:

1. Go to https://supabase.com, sign up, create a new project (free tier).
2. In the project dashboard, go to **Storage** → create a new bucket, e.g. `lokai-uploads`, set it to **public** (simplifies signed-URL logic for a hackathon demo — for a real product you'd keep it private with time-limited signed URLs).
3. Go to **Settings → API** and copy:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (or the service role key if Claude Code's upload logic needs elevated permissions — service role key is more powerful and should never be exposed client-side, only used in server-side API routes)
4. If you'd rather skip this for the hackathon and keep things simple, tell Claude Code explicitly to use local `/public/uploads` demo-mode storage instead — fewer moving parts, at the cost of uploads not surviving a redeploy. For a judged demo, this is often fine.

---

## 5. `.env` file

Create `.env.local` in your project root (Next.js convention — `.env` alone isn't automatically loaded the same way):

```bash
# Neo4j Aura
NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-generated-password

# LLM providers
CEREBRAS_API_KEY=your-cerebras-key
GEMINI_API_KEY=your-gemini-key

# Media storage (skip if using local demo-mode storage)
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# Admin auth (simple, hackathon-appropriate)
ADMIN_EMAIL=admin@lokai.demo
ADMIN_PASSWORD=choose-a-password
```

Give this exact list to Claude Code as your `.env.example` template — tell it explicitly: *"Read all secrets from process.env, never hardcode, and generate a `.env.example` with these exact variable names (no real values) for the README."*

---

## 6. Local run (once Claude Code has built the app)

```bash
npm install
npm run dev
```

Then:
```bash
npx ts-node scripts/seed.ts   # or however Claude Code names the seed script — check README
```

Visit `http://localhost:3000` — click through `/submit` once yourself with a test submission, then check the Aura console's Query tab to confirm a `Submission` node was actually written before you trust the dashboard.

---

## 7. Deploying to Vercel (so judges can try it hands-on)

1. Push your repo to GitHub.
2. Go to https://vercel.com, sign in with GitHub, click **Add New → Project**, import your repo.
3. In the **Environment Variables** section of the import screen, add every variable from your `.env.local` (Vercel does not read `.env.local` from your repo — you must re-enter them in the dashboard).
4. Deploy. Vercel will give you a `.vercel.app` URL — this is what you share with judges.
5. **Before your judging slot:** open the deployed URL yourself once to warm the Neo4j Aura instance (see cold-start note above), and click through all 3 pre-seeded demo scenarios to confirm nothing broke on the deployed environment (env vars are a common source of "works locally, breaks on Vercel" bugs — double check every key actually made it into the Vercel dashboard, not just your local `.env.local`).
6. If you added a `/api/demo-reset` route, run it once right before judging so the graph is in its clean pre-seeded state regardless of what you clicked while testing.

---

## 8. Order of operations (tying it all together)

1. Do steps 1-3 now (Neo4j, Cerebras, Gemini) — takes about 10-15 minutes total.
2. Decide on Supabase vs local demo-mode storage (step 4) — local is fine and simpler if you're short on time.
3. Hand the build prompt (`lokai-claude-code-prompt.md`) to Claude Code, along with the `.env` variable list from step 5 so it knows exactly what to read from `process.env`.
4. Once the app is scaffolded, run the seed script locally and verify in the Aura console before building further pages.
5. Deploy to Vercel only once the core flow (submit → dashboard → simulate) works locally — deploying earlier just adds a debugging surface you don't need yet.
