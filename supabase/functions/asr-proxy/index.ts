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
import WS from "npm:ws@^8.18.0";

const VOLCENGINE_ASR_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel";

function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  return null;
}

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
  const pendingQueue: Uint8Array[] = [];

  clientWs.onopen = () => {
    console.log("[asr-proxy] Client connected, opening upstream…");

    const requestId = crypto.randomUUID();

    upstream = new WS(VOLCENGINE_ASR_URL, {
      headers: {
        "X-Api-App-Key": appKey,
        "X-Api-Access-Key": accessKey,
        "X-Api-Resource-Id": resourceId,
        "X-Api-Request-Id": requestId,
      },
    });

    upstream.binaryType = "arraybuffer";

    upstream.on("open", () => {
      console.log("[asr-proxy] Upstream connected, flushing", pendingQueue.length, "buffered messages");
      // Flush buffered messages
      for (const msg of pendingQueue) {
        upstream!.send(msg);
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
          // Log first response for debugging
          if (bytes.length >= 4) {
            const msgType = (bytes[1] >> 4) & 0x0f;
            console.log("[asr-proxy] Upstream msg: type=", msgType, "len=", bytes.length);
            // If it looks like a text payload, log it
            if (bytes.length < 500 && bytes.length > 8) {
              try {
                const payloadStr = new TextDecoder().decode(bytes.slice(8));
                console.log("[asr-proxy] Upstream payload:", payloadStr.slice(0, 200));
              } catch (_) { /* ignore */ }
            }
          }
          // Send as a fresh copy
          clientWs.send(new Uint8Array(bytes).buffer);
        }
      } catch (e) {
        console.error("[asr-proxy] Error relaying upstream→client:", e);
      }
    });

    upstream.on("close", (code: number, reason: unknown) => {
      let reasonStr = "";
      try {
        if (reason instanceof Uint8Array || reason instanceof ArrayBuffer) {
          reasonStr = new TextDecoder().decode(reason as ArrayBufferLike);
        } else {
          reasonStr = String(reason ?? "");
        }
      } catch { reasonStr = String(reason); }
      console.log("[asr-proxy] Upstream closed:", code, reasonStr);
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
      // Convert any binary format to Uint8Array
      const bytes = toUint8Array(data);

      if (bytes) {
        // Log first few bytes for debugging
        if (bytes.length >= 4) {
          const msgType = (bytes[1] >> 4) & 0x0f;
          const msgFlags = bytes[1] & 0x0f;
          console.log("[asr-proxy] Client msg: type=", msgType, "flags=", msgFlags, "len=", bytes.length);
        }

        if (upstream && upstream.readyState === WS.OPEN) {
          upstream.send(bytes);
        } else {
          pendingQueue.push(new Uint8Array(bytes));
          console.log("[asr-proxy] Buffered message (queue:", pendingQueue.length, ")");
        }
      } else if (typeof data === "string") {
        console.log("[asr-proxy] Client sent text (unexpected):", data.slice(0, 100));
        if (upstream && upstream.readyState === WS.OPEN) {
          upstream.send(data);
        }
      } else if (data instanceof Blob) {
        // Handle Blob by converting to ArrayBuffer
        data.arrayBuffer().then((buf) => {
          const blobBytes = new Uint8Array(buf);
          console.log("[asr-proxy] Client Blob msg: len=", blobBytes.length);
          if (upstream && upstream.readyState === WS.OPEN) {
            upstream.send(blobBytes);
          } else {
            pendingQueue.push(blobBytes);
            console.log("[asr-proxy] Buffered Blob message (queue:", pendingQueue.length, ")");
          }
        });
      } else {
        console.warn("[asr-proxy] Unknown data type:", typeof data, data?.constructor?.name);
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
