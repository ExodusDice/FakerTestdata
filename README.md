# VASUP-Testdata

AI agent web portal that generates mock/test data for VASUP banking projects. Built for Senior Testers:
request test data through a guided chat, get a CSV + Excel export emailed to you.

## Features

- **Approval-gated registration** - new users register with a `@vasup.co.th` email; the request is emailed
  to the approver (default `wisanu.a@vasup.co.th`, who is also the seeded `sadmin` login). On approval, the
  user gets a login-credentials email followed by a confirmation email to set their own password.
- **Two fixed configuration logins** - `sadmin/sadmin` and `admin/admin` (change in `.env`), used for internal
  administration (approvals, banning testers, full user CRUD for sadmin), independent of the approval flow.
- **Chat-driven test data requests** - the AI is hard-coded into a single role: *Test Data Provider for VASUP
  projects*. It collects Project Name, BRD/FSD, Test Case and Test Plan (file attachments), a Condition,
  Test Type(s) (Happy / Negative / Boundary / custom), a delivery Email, and a Goal.
- **Export + email** - generates rows as `Project name | Test Name | Tester Positions (Jr/Mid/Sr.) | Test Case
  | Test Data | Test Type`, exports CSV + Excel, and emails both to the requested address.
- **Admin Portal** - pending approvals, user management (ban/unban, and full create/update/delete for sadmin),
  token usage per user/request, and an email delivery log.
- **Prompt Structure Manual** - in-app page (left sidebar) plus a downloadable Word document.

## Setup

```bash
npm install
cp .env.example .env   # then fill in SMTP + ANTHROPIC_API_KEY for a real deployment
npm start
```

Visit `http://localhost:3000`. Without SMTP configured, outgoing email is written to `data/outbox/` and
logged in the Admin Portal instead of actually sending - the whole flow (register -> approve -> login ->
generate -> "email") still works end-to-end for local testing. Without `ANTHROPIC_API_KEY`, test data
requests fall back to a built-in offline mock generator (clearly labeled as such in the chat and in the
admin token-usage log).

## Deploying

See [DEPLOYMENT.md](./DEPLOYMENT.md) for hosting this on a Docker-capable host (the `Dockerfile` and
`render.yaml` in this repo are ready for that - swap in whatever host/domain you have available).

## Data storage

All app state (users, requests, token usage, email log, one-time tokens) lives in `data/db.json`, a single
JSON file - intentionally simple for this internal, low-volume tool. Uploaded attachments live in
`data/uploads/`, generated exports in `data/exports/`. None of `data/` is committed to git.

## Project structure

```
src/
  server.js        entry point
  db.js            tiny JSON-file data store
  seed.js          seeds the sadmin/admin hardcoded accounts on boot
  mailer.js        nodemailer wrapper with mock-outbox fallback
  ai.js            Claude prompt + offline mock generator
  attachments.js   BRD/FSD/Test Case/Test Plan text extraction (.docx/.pdf/.txt/.xlsx)
  exporter.js      CSV/XLSX writer
  routes/          auth.js, portal.js, admin.js, manual.js
views/             EJS templates
public/            CSS + client-side chat JS
```
