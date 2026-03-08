import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---- Qiniu Token Signature ----
async function qiniuSign(ak: string, sk: string, method: string, path: string, host: string, contentType: string, body: string): Promise<string> {
  // Step 1: Construct data to sign
  // data = <Method> + " " + <Path> + "\nHost: " + <Host> + "\nContent-Type: " + <contentType> + "\n\n" + <body>
  let data = `${method} ${path}\nHost: ${host}\nContent-Type: ${contentType}\n\n`;
  if (body && contentType !== "application/octet-stream") {
    data += body;
  }

  // Step 2: HMAC-SHA1 sign and URL-safe base64 encode
  const key = new TextEncoder().encode(sk);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));

  // URL-safe Base64
  const base64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  // Step 3: Qiniu <AK>:<encodedSign>
  return `Qiniu ${ak}:${base64}`;
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

    // Send SMS via Qiniu Cloud
    const QINIU_AK = Deno.env.get("QINIU_SMS_AK");
    const QINIU_SK = Deno.env.get("QINIU_SMS_SK");
    const QINIU_TEMPLATE_ID = Deno.env.get("QINIU_SMS_TEMPLATE_ID");

    if (!QINIU_AK || !QINIU_SK || !QINIU_TEMPLATE_ID) {
      // Dev mode: return OTP directly
      console.warn("Qiniu SMS not configured, returning code for dev");
      return new Response(
        JSON.stringify({ success: true, dev_code: code }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const smsHost = "sms.qiniuapi.com";
    const smsPath = "/v1/message/single";
    const contentType = "application/json";
    const smsBody = JSON.stringify({
      template_id: QINIU_TEMPLATE_ID,
      mobiles: [phone],
      parameters: { code },
    });

    const authorization = await qiniuSign(
      QINIU_AK,
      QINIU_SK,
      "POST",
      smsPath,
      smsHost,
      contentType,
      smsBody
    );

    const smsRes = await fetch(`https://${smsHost}${smsPath}`, {
      method: "POST",
      headers: {
        Host: smsHost,
        "Content-Type": contentType,
        Authorization: authorization,
      },
      body: smsBody,
    });

    const smsResult = await smsRes.text();
    if (!smsRes.ok) {
      console.error("Qiniu SMS error:", smsResult);
      throw new Error(`短信发送失败: ${smsResult}`);
    }

    console.log("Qiniu SMS response:", smsResult);

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
