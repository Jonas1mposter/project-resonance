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
  const pendingQueue: (ArrayBuffer | string)[] = [];

  clientWs.onopen = () => {
    console.log("[asr-proxy] Client connected, opening upstream…");

    upstream = new WS(VOLCENGINE_ASR_URL, {
      headers: {
        "X-Api-App-Key": appKey,
        "X-Api-Access-Key": accessKey,
        "X-Api-Resource-Id": resourceId,
      },
    });

    upstream.binaryType = "arraybuffer";

    upstream.on("open", () => {
      console.log("[asr-proxy] Upstream connected, flushing", pendingQueue.length, "buffered messages");
      // Flush buffered messages
      for (const msg of pendingQueue) {
        if (msg instanceof ArrayBuffer) {
          upstream!.send(new Uint8Array(msg));
        } else {
          upstream!.send(msg);
        }
      }
      pendingQueue.length = 0;
    });

    upstream.on("message", (data: Buffer | ArrayBuffer | Uint8Array) => {
      try {
        if (clientWs.readyState === WebSocket.OPEN) {
          // Always create a clean Uint8Array copy to avoid Buffer offset issues
          let bytes: Uint8Array;
          if (data instanceof ArrayBuffer) {
            bytes = new Uint8Array(data);
          } else {
            // Buffer or Uint8Array - slice to exact bounds
            bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          }
          // Send as a fresh copy to avoid shared buffer issues
          clientWs.send(new Uint8Array(bytes).buffer);
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
      const data = event.data;
      if (upstream && upstream.readyState === WS.OPEN) {
        if (data instanceof ArrayBuffer) {
          upstream.send(new Uint8Array(data));
        } else if (typeof data === "string") {
          upstream.send(data);
        }
      } else {
        // Buffer messages until upstream is ready
        if (data instanceof ArrayBuffer) {
          pendingQueue.push(data);
        } else if (typeof data === "string") {
          pendingQueue.push(data);
        }
        console.log("[asr-proxy] Upstream not ready, buffered message (queue:", pendingQueue.length, ")");
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
