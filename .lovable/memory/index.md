# Memory: index.md
Updated: just now

# Project Memory

## Core
- **Mission**: Accessibility-first product for users with dysarthria and elderly users. Every UX/perf/compat decision must serve this.
- **Browser compat**: Must work on cheap/old domestic Chinese phones — old Android WebView, QQ/UC/百度/华为/小米 browsers, WeChat WebView. No bleeding-edge JS/CSS without polyfill or fallback. Test against ES2015 baseline (already enforced in vite.config.ts).
- **All API calls via Worker**: Browser MUST only hit same-origin `/api/*` (Cloudflare Worker). Never call `*.supabase.co`, `googleapis.com`, etc. directly — China network blocks/flakes them. Add new Worker route for every external API.
- Architecture: Cloudflare Worker proxy via VPC bindings (`http://127.0.0.1`), relative paths `/api/*`.
- **Portability rule**: Cloudflare-first but NEVER hard-bind to Lovable — no `lovable.app` URLs, no Lovable SDKs, no project IDs in runtime code. Must run under `wrangler dev` standalone.
- Agent Boundary: NEVER modify backend GPU/Python code (Whisper/CosyVoice). User handles deployment.
- Constraints: Disable ALL login/auth for ICP compliance. Always use `npm install --legacy-peer-deps`.
- WeChat WebView: Disable framer-motion, bridge recording to native, debounce touch events 350ms.
- Resilience: Edge functions must return HTTP 200 with `{ok: false, error: "..."}`, NEVER HTTP 500.
- Design: Warm Orange-Yellow gradient. Motor-accessible (dwell-to-click, 56px touch targets, no motion).
- Corpus: Auto-collected speech corpus → Tencent Cloud VPS (`https://corpus.sg.superbrain-ai.com/api/corpus`), NOT Supabase.

## Memories
- [All API via Worker](mem://constraints/api-traffic-via-worker) — Browser must only hit same-origin /api/*; never call Supabase/Google directly from China
- [Cloudflare-First Portability](mem://constraints/portability) — Build for CF edge but keep code portable; no Lovable lock-in
- [Cloudflare Worker Architecture](mem://tech/architecture) — CF Worker proxying ASR/TTS via VPC bindings to bypass Lovable API limits
- [Corpus Collection Server](mem://tech/corpus-collection-server) — Self-hosted Node.js+SQLite API on Tencent Cloud VPS for speech corpus
- [Project Overview](mem://project/overview) — Dysarthria voice assistant via WeChat WebView, ASR/TTS, and ICP compliance
- [Vibrant Modern Design System](mem://style/design-system) — Warm Orange-Yellow gradients and accessible UI to avoid clinical feel
- [Motor-Impairment Accessibility](mem://style/accessibility-motor-impairment) — dwell-to-click, large touch targets, high contrast, and reduced motion
- [Capacitor Mobile Build](mem://tech/mobile-deployment) — iOS/Android build requirements, Gradle mirror, and Capacitor config
- [Mobile Notch UX](mem://style/mobile-ux) — Viewport safe area padding for mobile app layout
- [Node Version Constraints](mem://constraints/platform) — Node 22.0.0+ required for Capacitor CLI v8; handle Vite peer deps
- [ASR Evaluation Metrics](mem://features/experiment-dashboard) — nCER, Top-K, OOV metrics and test data standards
- [ICP Filing Compliance](mem://constraints/icp-filing) — Disable all auth and login during Baidu Cloud ICP review
- [WeChat WebView Adaptation](mem://constraints/wechat-webview-limitations) — JSSDK for audio, disable framer-motion, 350ms debounce for touch
- [WeChat Mini Program Config](mem://tech/wechat-mini-program) — Component lazy loading and safe initialization
- [Keyboard Shortcuts](mem://features/keyboard-shortcuts) — Global navigation and UsagePage specific shortcuts
- [ASR and TTS Integration](mem://features/tts-capability) — Local Whisper for ASR, Local CosyVoice for TTS, health ping logic
- [Edge Function Error Handling](mem://tech/resilience/structured-error-handling) — Proxies return HTTP 200 with JSON error state instead of 500
- [Agent Boundary Rules](mem://constraints/collaboration-boundaries) — Do not touch CosyVoice or ASR backend python scripts/deployment
- [Deployment Workflow](mem://tech/deployment/unified-workflow) — npm run build and wrangler deploy workflow
