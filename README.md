# Assistant Next

Native iPhone planner with a Russian conversational interface. A model extracts
intent and constraints; a deterministic scheduler checks times, breaks and dependencies.
Drafts require confirmation, records have stable IDs, and request/confirmation receipts
make interrupted delivery safe to repeat.

This repository contains new generic source code and synthetic simulator fixtures.
It contains no owner's records, credentials, certificates or production configuration.

## Local verification

Node 22+ (no npm dependencies):

```sh
node --test tests/*.test.mjs
node tools/check.mjs
node tools/demo.mjs
node server/local.mjs
```

The local server binds to 127.0.0.1:8137. Its credential and atomic primary/backup state
files live outside this source tree by default. Set APP_TOKEN (32+ characters) and
DEEPSEEK_API_KEY only in the private runtime environment. API calls are budgeted before
dispatch and unknown paid calls are not automatically repeated. Default caps: $0.10/day,
$1/month. Pricing reference: https://api-docs.deepseek.com/quick_start/pricing/ .

## iPhone

Native SwiftUI, iOS 26+, XcodeGen project at ios/project.yml. The manual workflow builds
an unsigned device IPA, launches an isolated simulator and runs UI checks. No signing
credential is uploaded. Demo mode requires --demo and is compiled out on device.

The new bundle ID app.assistant.next allows side-by-side evaluation without replacing
the previous application. A private JSON connection file has shape
`{"server":"https://your-private-server.example","token":"your-device-secret"}` and
is imported in Settings. The token is stored in Keychain. Real iPhone installation,
dictation and background behavior require device verification.

## API

- GET /health (public, no user data)
- GET /v1/snapshot and /v1/export (bearer token)
- POST /v1/messages {requestID,text}: persist request, return jobID immediately
- POST /v1/proposals/confirm or /decline {proposalID}
- POST /v1/proposals/edit {proposalID,taskID,durationMinutes,dueDate}
- POST /v1/tasks: create/edit/complete with requestID and expectedRevision
- POST /v1/profile: explicit settings update with expectedRevision
- POST /v1/import/preview: legacy 25.3 export, preview before applying; full source retained

Cloudflare entry server/worker.mjs stores owner state and jobs in a SQLite Durable Object.
Long state is chunked within an atomic transaction, rather than exceeding one storage value.
Google synchronization is deliberately disabled in this candidate. Saved internal records
are never described as successfully written to Google. Existing installations and their
data are not modified by building or running this candidate.
