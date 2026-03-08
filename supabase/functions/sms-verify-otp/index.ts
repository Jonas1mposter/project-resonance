import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, code, displayName } = await req.json();

    if (!phone || !code) {
      return new Response(JSON.stringify({ error: "手机号和验证码必填" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find valid OTP
    const { data: otpRows, error: otpErr } = await supabaseAdmin
      .from("phone_otps")
      .select("*")
      .eq("phone", phone)
      .eq("code", code)
      .eq("verified", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (otpErr) throw new Error(`OTP query failed: ${otpErr.message}`);
    if (!otpRows || otpRows.length === 0) {
      return new Response(JSON.stringify({ error: "验证码错误或已过期" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark OTP as verified
    await supabaseAdmin
      .from("phone_otps")
      .update({ verified: true })
      .eq("id", otpRows[0].id);

    // Check if user exists with this phone
    const fakeEmail = `${phone}@phone.local`;

    // Try to find existing user by email (phone-based)
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email === fakeEmail || u.phone === `+86${phone}`
    );

    let session;

    if (existingUser) {
      // Sign in existing user — generate session via magic link token
      // We use admin API to create a session directly
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: fakeEmail,
      });
      if (error) throw new Error(`Generate link failed: ${error.message}`);

      // Exchange the token_hash for a session
      // The client will use the token_hash to verify
      session = {
        type: "existing",
        token_hash: data.properties?.hashed_token,
        email: fakeEmail,
        user_id: existingUser.id,
      };
    } else {
      // Create new user
      const tempPassword = crypto.randomUUID();
      const { data: newUser, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email: fakeEmail,
          password: tempPassword,
          phone: `+86${phone}`,
          email_confirm: true,
          phone_confirm: true,
          user_metadata: {
            display_name: displayName || phone,
            phone: phone,
          },
        });

      if (createErr) throw new Error(`Create user failed: ${createErr.message}`);

      // Generate a magic link for the new user to get a session
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: fakeEmail,
      });
      if (error) throw new Error(`Generate link failed: ${error.message}`);

      session = {
        type: "new",
        token_hash: data.properties?.hashed_token,
        email: fakeEmail,
        user_id: newUser.user?.id,
      };
    }

    return new Response(JSON.stringify({ success: true, session }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sms-verify-otp error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
