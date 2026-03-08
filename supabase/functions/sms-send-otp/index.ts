import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---- BCE Signature (百度云 API 签名) ----
async function hmacSha256Hex(key: Uint8Array, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function uriEncode(str: string, encodeSlash = true): string {
  return [...str]
    .map((ch) => {
      if (
        (ch >= "A" && ch <= "Z") ||
        (ch >= "a" && ch <= "z") ||
        (ch >= "0" && ch <= "9") ||
        ch === "." ||
        ch === "-" ||
        ch === "_" ||
        ch === "~"
      ) {
        return ch;
      }
      if (ch === "/" && !encodeSlash) return ch;
      return "%" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
    })
    .join("");
}

async function bceSig(
  ak: string,
  sk: string,
  method: string,
  path: string,
  headers: Record<string, string>,
  _params: Record<string, string> = {}
): Promise<string> {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const expiration = 1800;
  const authPrefix = `bce-auth-v1/${ak}/${now}/${expiration}`;

  // signing key
  const signingKey = await hmacSha256Hex(new TextEncoder().encode(sk), authPrefix);

  // canonical URI
  const canonicalUri = uriEncode(path, false);

  // canonical query string
  const qs = Object.keys(_params)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(_params[k])}`)
    .join("&");

  // canonical headers — use host + content-type
  const signedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .filter((k) => k === "host" || k === "content-type")
    .sort();

  const canonicalHeaders = signedHeaderKeys
    .map((k) => {
      const val = headers[Object.keys(headers).find((h) => h.toLowerCase() === k)!];
      return `${uriEncode(k)}:${uriEncode(val.trim())}`;
    })
    .join("\n");

  const canonicalRequest = `${method}\n${canonicalUri}\n${qs}\n${canonicalHeaders}`;

  const signature = await hmacSha256Hex(
    new TextEncoder().encode(signingKey),
    canonicalRequest
  );

  return `${authPrefix}/${signedHeaderKeys.join(";")}/${signature}`;
}

// ---- Main handler ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone } = await req.json();
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return new Response(JSON.stringify({ error: "无效的手机号" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate 6-digit OTP
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    // Store OTP in database
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Delete previous unused OTPs for this phone
    await supabaseAdmin
      .from("phone_otps")
      .delete()
      .eq("phone", phone)
      .eq("verified", false);

    const { error: insertErr } = await supabaseAdmin.from("phone_otps").insert({
      phone,
      code,
      expires_at: expiresAt.toISOString(),
    });
    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

    // Send SMS via Baidu Cloud
    const BCE_AK = Deno.env.get("BCE_SMS_AK");
    const BCE_SK = Deno.env.get("BCE_SMS_SK");
    const BCE_INVOKE_ID = Deno.env.get("BCE_SMS_INVOKE_ID");
    const BCE_TEMPLATE = Deno.env.get("BCE_SMS_TEMPLATE_CODE");

    if (!BCE_AK || !BCE_SK || !BCE_INVOKE_ID || !BCE_TEMPLATE) {
      // If Baidu SMS not configured, return OTP in dev mode (remove in production!)
      console.warn("Baidu SMS not configured, returning code for dev");
      return new Response(
        JSON.stringify({ success: true, dev_code: code }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const smsEndpoint = "smsv3.bj.baidubce.com";
    const smsPath = "/api/v3/sendSms";
    const smsBody = JSON.stringify({
      mobile: phone,
      signatureId: Deno.env.get("BCE_SMS_SIGNATURE_ID") || "",
      template: BCE_TEMPLATE,
      contentVar: { code },
    });

    const smsHeaders: Record<string, string> = {
      Host: smsEndpoint,
      "Content-Type": "application/json",
    };

    const authorization = await bceSig(BCE_AK, BCE_SK, "POST", smsPath, smsHeaders);

    const smsRes = await fetch(`https://${smsEndpoint}${smsPath}`, {
      method: "POST",
      headers: {
        ...smsHeaders,
        Authorization: authorization,
      },
      body: smsBody,
    });

    const smsResult = await smsRes.text();
    if (!smsRes.ok) {
      console.error("Baidu SMS error:", smsResult);
      throw new Error(`短信发送失败: ${smsResult}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sms-send-otp error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
