import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const hookSecret = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "").replace(/^v1,whsec_/, "");
const gasUrl = Deno.env.get("AUTH_EMAIL_GAS_URL") || "";
const gasSecret = Deno.env.get("AUTH_EMAIL_GAS_SECRET") || "";

type EmailHookPayload = {
  user: {
    email?: string;
    new_email?: string;
  };
  email_data: {
    token: string;
    token_hash: string;
    token_new?: string;
    token_hash_new?: string;
    redirect_to: string;
    email_action_type: string;
  };
};

async function sendThroughGas(to: string, emailData: EmailHookPayload["email_data"]) {
  const response = await fetch(gasUrl, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "sendAuthEmail",
      secret: gasSecret,
      to,
      emailData,
    }),
  });
  const text = await response.text();
  let result: { success?: boolean; error?: string };
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("GAS returned a non-JSON response.");
  }
  if (!response.ok || result.success !== true) {
    throw new Error(result.error || `GAS email delivery failed (${response.status}).`);
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!hookSecret || !gasUrl || !gasSecret) {
    return new Response("Email hook secrets are not configured.", { status: 500 });
  }

  try {
    const rawBody = await request.text();
    const payload = new Webhook(hookSecret).verify(
      rawBody,
      Object.fromEntries(request.headers),
    ) as EmailHookPayload;
    const { user, email_data: emailData } = payload;

    if (emailData.email_action_type === "email_change" && user.new_email) {
      if (emailData.token_hash_new) {
        await sendThroughGas(user.email || "", {
          ...emailData,
          token_hash: emailData.token_hash_new,
        });
      }
      await sendThroughGas(user.new_email, {
        ...emailData,
        token: emailData.token_new || emailData.token,
      });
    } else {
      await sendThroughGas(user.email || "", emailData);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("send-auth-email:", error);
    return new Response(
      error instanceof Error ? error.message : "Authentication email delivery failed.",
      { status: 500 },
    );
  }
});
