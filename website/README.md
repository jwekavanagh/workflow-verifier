# Workflow Verifier — website

## Run locally (recommended)

```bash
# From repo root (after npm install)
cd website
copy .env.example .env   # then edit DATABASE_URL, AUTH_SECRET, etc.
npx drizzle-kit migrate
npm run dev
```

Open **http://127.0.0.1:3000** (not only `localhost` if your env binds oddly).

Use **`npm run dev`** for day-to-day work. Use **`npm run build` + `npm run start`** only when you need a production-like run.

## If `next build` fails with `EBUSY` (Windows)

Another process is locking `website/.next` (common with **OneDrive** under `OneDrive\projects\...`).

1. Stop any running `next start` / `next dev` (Ctrl+C).
2. Close anything that might scan the folder (optional: pause OneDrive sync for this directory).
3. Delete the cache and rebuild:

   ```powershell
   Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
   npm run build
   ```

4. If it still fails, keep using **`npm run dev`** (no full trace step like production build).

## Vercel / CI monorepo tracing

Set env **`NEXT_CONFIG_TRACE_ROOT=1`** on the **website** build so `outputFileTracingRoot` includes the repo root (not needed for local `npm run dev`).
