/**
 * ASR WebSocket Proxy Edge Function
 *
 * Relays WebSocket frames between the browser client and the Volcengine
 * BigModel ASR service, injecting the required auth headers that browsers
 * cannot set on WebSocket connections.
 *
 * Query params (optional):
 *   - resource_id  (default: volc.bigasr.sauc.duration)
 */
import WS from "npm:ws@8.18.0";

const VOLCENGINE_ASR_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel";

Deno.serve((req) => {
  // Only accept WebSocket upgrades
  const upgradeHeader = req.headers.get("upgrade") || "";
  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response(
      JSON.stringify({ error: "This endpoint requires a WebSocket upgrade" }),
      {
        status: 426,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      },
    );
  }

  const url = new URL(req.url);
  const resourceId =
    url.searchParams.get("resource_id") || "volc.bigasr.sauc.duration";

  const appKey = Deno.env.get("VOLCENGINE_ASR_APP_KEY");
  const accessKey = Deno.env.get("VOLCENGINE_ASR_ACCESS_KEY");

  if (!appKey || !accessKey) {
    return new Response(
      JSON.stringify({ error: "ASR credentials not configured" }),
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      },
    );
  }

  // Upgrade the client (browser) connection
  const { socket: clientWs, response } = Deno.upgradeWebSocket(req);

  let upstream: InstanceType<typeof WS> | null = null;

  clientWs.onopen = () => {
    console.log("[asr-proxy] Client connected, opening upstream…");

    // Connect to Volcengine with auth headers via npm:ws
    upstream = new WS(VOLCENGINE_ASR_URL, {
      headers: {
        "X-Api-App-Key": appKey,
        "X-Api-Access-Key": accessKey,
        "X-Api-Resource-Id": resourceId,
      },
    });

    // Receive binary frames from the server
    upstream.binaryType = "arraybuffer";

    upstream.on("open", () => {
      console.log("[asr-proxy] Upstream connected");
    });

    upstream.on("message", (data: ArrayBuffer | Buffer) => {
      try {
        if (clientWs.readyState === WebSocket.OPEN) {
          // Ensure we send an ArrayBuffer
          const buf =
            data instanceof ArrayBuffer
              ? data
              : (data as Buffer).buffer.slice(
                  (data as Buffer).byteOffset,
                  (data as Buffer).byteOffset + (data as Buffer).byteLength,
                );
          clientWs.send(buf);
        }
      } catch (e) {
        console.error("[asr-proxy] Error relaying upstream→client:", e);
      }
    });

    upstream.on("close", (code: number, reason: string) => {
      console.log("[asr-proxy] Upstream closed:", code, reason);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(1000, "ASR session ended");
      }
    });

    upstream.on("error", (err: Error) => {
      console.error("[asr-proxy] Upstream error:", err.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(1011, "Upstream error");
      }
    });
  };

  // Relay client → upstream (binary ASR protocol frames)
  clientWs.onmessage = (event: MessageEvent) => {
    try {
      if (upstream && upstream.readyState === WS.OPEN) {
        const data = event.data;
        if (data instanceof ArrayBuffer) {
          upstream.send(Buffer.from(data));
        } else if (typeof data === "string") {
          upstream.send(data);
        }
      } else {
        console.warn("[asr-proxy] Upstream not ready, buffering skipped");
      }
    } catch (e) {
      console.error("[asr-proxy] Error relaying client→upstream:", e);
    }
  };

  clientWs.onclose = () => {
    console.log("[asr-proxy] Client disconnected");
    if (upstream && upstream.readyState === WS.OPEN) {
      upstream.close();
    }
    upstream = null;
  };

  clientWs.onerror = (e: Event) => {
    console.error("[asr-proxy] Client error:", e);
  };

  return response;
});
