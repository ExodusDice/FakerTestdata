# Deploying VASUP-Testdata

This app needs a **persistent Node server** (login sessions, file uploads, a JSON data file) - it cannot
run on a static host or a serverless platform (Vercel/Netlify functions) without moving storage elsewhere.
The `Dockerfile` and `render.yaml` in this repo target any Docker-capable host (Render is used below as
one example - swap in whatever host and domain you actually have available).

## ⚠️ One real limitation to decide on first

A free-tier host's filesystem commonly resets on every deploy and on every scale-down-from-idle cycle.
That means `data/db.json` (users, requests, token usage) and uploaded/exported files would be wiped
periodically unless the host gives you a persistent volume/disk.

Pick one:
1. **Accept it for now** - fine for a demo/internal pilot with few users; data just won't survive a redeploy.
2. **Use a paid tier with a persistent disk** - uncomment the `disk:` block in `render.yaml` (or the
   equivalent on whatever host you use), mounted at `/app/data`. The app already reads/writes everything
   under `data/`, so no code change is needed.
3. **Move storage off-box later** (e.g. a small hosted Postgres or a service like Turso/S3) - a bigger
   change, not needed unless you outgrow option 1 or 2.

## Step 1: Push this repo to GitHub

Already done - `https://github.com/ExodusDice/FakerTestdata` (branch `main`).

## Step 2: Deploy the container to a host you control

Using Render as an example (any Docker-capable host works the same way - build the `Dockerfile`, run
`node src/server.js`, expose port 3000):

1. Sign in to your host with your GitHub account.
2. Create a new web service from this repo. If the host reads `render.yaml` automatically, it will
   propose the `vasup-testdata` service (Docker environment). Otherwise configure manually: Environment =
   Docker, no separate build/start command needed (the Dockerfile handles both).
3. Fill in the env vars marked `sync: false` in `render.yaml`: `APP_BASE_URL` (the real public URL you'll
   use), `SADMIN_PASSWORD`, `ADMIN_PASSWORD`, `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`, and `ANTHROPIC_API_KEY`.
   Leaving SMTP/Anthropic blank is fine to start - the app falls back to mock email/offline generation,
   same as running it locally.
4. Deploy. Note the URL the host assigns you.

## Step 3: Point a domain at it (optional)

If/when you have a domain to use for this, add a CNAME (or A record, depending on the host) pointing at
the URL from Step 2, then add it as a custom domain in your host's dashboard for automatic SSL. No specific
domain is assumed here - use whatever you're actually authorized to use for this.

## Step 4: Update APP_BASE_URL

Whatever public URL you land on (host-provided URL or your own domain), set `APP_BASE_URL` to it exactly
(including `https://`, no trailing slash) - this is what gets embedded in approval/reset-password links in
outgoing emails.

## After deploy - smoke test

1. Visit `<your-url>/login`.
2. Log in as `sadmin` / (the password you set in the host's env vars).
3. Register a test `@vasup.co.th` account, approve it from the Admin Portal, log in as that user, and run
   one chat request through to a generated CSV/Excel.
4. Check the Admin Portal's token usage and email log to confirm both are recording.

## Redeploying

Most hosts (Render included) auto-deploy on every push to `main` by default - check your host's dashboard
for that toggle if you'd rather deploy manually.
