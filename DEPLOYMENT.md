# Deploying VASUP-Testdata to vasup.franktest.xyz

This app needs a **persistent Node server** (login sessions, file uploads, a JSON data file) - it cannot
run on a static host or a serverless platform (Vercel/Netlify functions) without moving storage elsewhere.
The steps below use the same domain + host pattern previously used for the old `vasup-workspace` project:
Namecheap DNS -> Render free web service.

## ⚠️ One real limitation to decide on first

Render's **free** plan has no persistent disk - the filesystem resets on every deploy and on every time
the free instance spins down from inactivity (~15 min idle) and back up. That means `data/db.json`
(users, requests, token usage) and uploaded/exported files would be wiped periodically.

Pick one:
1. **Accept it for now** - fine for a demo/internal pilot with few users; data just won't survive a redeploy.
2. **Upgrade to Render's Starter plan** (~$7/mo) and attach a persistent disk - uncomment the `disk:` block
   in `render.yaml`, mounted at `/app/data`. This is the only change needed; the app already reads/writes
   everything under `data/`.
3. **Move storage off-box later** (e.g. a small hosted Postgres or a service like Turso/S3) - a bigger change,
   not needed unless you outgrow option 1 or 2.

## Step 1: Push this repo to GitHub

Already done - `https://github.com/ExodusDice/FakerTestdata` (branch `main`).

## Step 2: Create the Render service

1. Sign in at [render.com](https://render.com) with your GitHub account.
2. **New +** -> **Blueprint**, point it at this repo - Render will read `render.yaml` and propose the
   `vasup-testdata` web service automatically (Docker environment, free plan).
   - Alternatively, **New +** -> **Web Service** manually: select this repo, Environment = `Docker`,
     leave build/start commands blank (the Dockerfile handles both).
3. Before first deploy, fill in the env vars marked `sync: false` in `render.yaml` (Render will prompt for
   them in the dashboard): `SADMIN_PASSWORD`, `ADMIN_PASSWORD`, `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`, and
   `ANTHROPIC_API_KEY`. Leaving SMTP/Anthropic blank is fine to start - the app falls back to mock
   email/offline generation, as it does locally.
4. Deploy. Note the generated URL, e.g. `vasup-testdata.onrender.com`.

## Step 3: Point vasup.franktest.xyz at it

1. Log into [Namecheap](https://ap.www.namecheap.com/) -> **Domain List** -> **Manage** on `franktest.xyz`
   -> **Advanced DNS**.
2. If a `vasup` CNAME record already exists (from the old workspace-hub project), edit it; otherwise
   **Add New Record**:
   - Type: `CNAME Record`
   - Host: `vasup`
   - Value: `vasup-testdata.onrender.com.` (your actual Render URL, from Step 2)
   - TTL: `Automatic`
3. In the Render dashboard: service -> **Settings** -> **Custom Domains** -> **Add Custom Domain** ->
   `vasup.franktest.xyz`. Render verifies the CNAME and issues a free SSL certificate automatically.

## Step 4: Update APP_BASE_URL

`render.yaml` already sets `APP_BASE_URL=https://vasup.franktest.xyz` - this is what gets embedded in
approval/reset-password links in outgoing emails, so it must match the real public URL exactly (including
`https://`, no trailing slash).

## After deploy - smoke test

1. Visit `https://vasup.franktest.xyz/login`.
2. Log in as `sadmin` / (the password you set in Render's env vars).
3. Register a test `@vasup.co.th` account, approve it from the Admin Portal, log in as that user, and run
   one chat request through to a generated CSV/Excel.
4. Check the Admin Portal's token usage and email log to confirm both are recording.

## Redeploying

Render auto-deploys on every push to `main` by default (toggle under service Settings if you'd rather
deploy manually).
