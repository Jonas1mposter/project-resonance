/**
 * Deprecated: superseded by worker/cosyvoice-tts.ts (CF Worker, FastAPI adapter).
 * Cloudflare Pages routing is no longer used; Worker handles /api/cosyvoice-tts.
 * Kept as a stub to surface accidental Pages-only deployments.
 */
export const onRequest: PagesFunction = async () => {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'cosyvoice-tts moved to Cloudflare Worker. Deploy via `wrangler deploy`.',
      fallback: true,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
  );
};
