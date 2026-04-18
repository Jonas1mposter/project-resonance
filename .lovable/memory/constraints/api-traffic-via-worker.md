---
name: All API calls go through Worker
description: Browser must NEVER call external APIs directly; always proxy via same-origin Cloudflare Worker /api/* to survive China network conditions
type: constraint
---
**Rule**: Frontend code (src/, browser-side) must call ONLY same-origin `/api/*` paths served by our Cloudflare Worker. Never call `*.supabase.co/functions/v1/*`, `generativelanguage.googleapis.com`, or any other third-party API directly from the browser.

**Why**:
- Direct cross-border requests from China are flaky/blocked (great firewall, DNS pollution, TLS interception).
- Our Worker domain is ICP-filed and stable; bouncing through it gives uniform latency, retry, and error handling.
- Same-origin requests bypass CORS entirely and survive WeChat WebView's quirky network stack.

**How to apply**:
- Add a new Worker route under `worker/` for any new external API (e.g. `worker/gemini-asr.ts`, `worker/sms-send-otp.ts`).
- Register the route in `worker/index.ts` under `path === '/api/<name>'`.
- Frontend uses `fetch(\`${import.meta.env.VITE_WORKER_API_URL || ''}/api/<name>\`, ...)`.
- Configure upstream URL + key as Worker secrets (`wrangler secret put XXX`); never hardcode and never expose to browser.
- `supabase.functions.invoke(...)` is forbidden in `src/` outside the auth client itself.

**Existing exceptions (must fix when re-enabled)**:
- `src/pages/AuthPage.tsx` still uses `supabase.functions.invoke('sms-send-otp' / 'sms-verify-otp')` — marked TODO. Currently dead code (auth disabled for ICP). Must add `/api/sms-send-otp` and `/api/sms-verify-otp` Worker routes before re-enabling.
