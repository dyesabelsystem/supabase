import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.108.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const gasUrl = Deno.env.get("AUTH_EMAIL_GAS_URL") || "";
const gasSecret = Deno.env.get("AUTH_EMAIL_GAS_SECRET") || "";
const supportEmail = Deno.env.get("DYESABEL_SUPPORT_EMAIL") || "projectdyesabel@gmail.com";
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const secretKeys = (() => {
  try {
    return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, string>;
  } catch {
    return {};
  }
})();
const serverKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const admin = createClient(supabaseUrl, serverKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type EmailDetail = { label: string; value: string };
type EmailContent = {
  subject: string;
  eyebrow: string;
  title: string;
  message: string;
  detail?: string;
  warning?: string;
  buttonLabel?: string;
  actionUrl?: string;
  disclaimer?: string;
  details?: EmailDetail[];
};

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

const text = (value: unknown, max = 1000) =>
  String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const email = (value: unknown) => {
  const normalized = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("A valid email address is required.");
  }
  return normalized;
};

async function sendEmail(to: string, template: string, content: EmailContent) {
  const response = await fetch(gasUrl, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "sendApplicationEmail",
      secret: gasSecret,
      to,
      template,
      content,
    }),
  });
  const responseText = await response.text();
  let result: { success?: boolean; error?: string; referenceId?: string };
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error("GAS returned a non-JSON response.");
  }
  if (!response.ok || result.success !== true) {
    throw new Error(result.error || "GAS email delivery failed.");
  }
  return result.referenceId || "";
}

async function subscribeNewsletter(body: Record<string, unknown>) {
  const recipient = email(body.email);
  const source = text(body.source || "Website Footer", 120);
  const id = crypto.randomUUID();
  const { error: insertError } = await admin.from("newsletter_subscribers").insert({
    id,
    email: recipient,
    email_normalized: recipient,
    status: "active",
    source,
  });
  if (insertError?.code === "23505") {
    return { success: true, message: "You are already subscribed.", alreadySubscribed: true };
  }
  if (insertError) throw insertError;

  try {
    const referenceId = await sendEmail(recipient, "newsletter_welcome", {
      subject: "Welcome to DYESABEL PH updates",
      eyebrow: "WELCOME TO THE COMMUNITY",
      title: "Your subscription is confirmed",
      message: "Thank you for subscribing to DYESABEL PH updates.",
      detail: "You will receive organization news, environmental advocacy updates, chapter activities, and opportunities to participate.",
      buttonLabel: "Visit DYESABEL PH",
      actionUrl: "https://www.dyesabelph.org",
      warning: "If you did not subscribe, contact us and we will remove this address.",
      details: [{ label: "Subscription source", value: source }],
    });
    return { success: true, message: "Subscription confirmed. Check your email.", referenceId };
  } catch (error) {
    await admin.from("newsletter_subscribers").delete().eq("id", id);
    throw error;
  }
}

async function createSupportTicket(body: Record<string, unknown>) {
  const recipient = email(body.email);
  const messages = Array.isArray(body.messages)
    ? body.messages.slice(0, 80).map((item) => ({
        content: text((item as Record<string, unknown>)?.content, 1500),
        sentAt: text((item as Record<string, unknown>)?.sentAt, 80),
      })).filter((item) => item.content)
    : [];
  if (!messages.length) throw new Error("At least one ticket message is required.");

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from("chatbot_tickets")
    .select("id", { count: "exact", head: true })
    .eq("email", recipient)
    .gte("created_at", oneHourAgo);
  if (countError) throw countError;
  if ((count || 0) >= 3) throw new Error("Ticket limit reached. Please try again in one hour.");

  const trackingNumber = `DYES-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const createdAt = new Date();
  const context = typeof body.context === "object" && body.context ? body.context : {};
  const { error: insertError } = await admin.from("chatbot_tickets").insert({
    tracking_number: trackingNumber,
    email: recipient,
    messages,
    context,
    status: "open",
    created_at: createdAt.toISOString(),
  });
  if (insertError) throw insertError;

  const messagePreview = messages.map((item, index) => `${index + 1}. ${item.content}`).join("\n").slice(0, 3500);
  try {
    const customerReferenceId = await sendEmail(recipient, "support_ticket_confirmation", {
      subject: `DYESABEL support ticket ${trackingNumber}`,
      eyebrow: "SUPPORT REQUEST RECEIVED",
      title: "Your ticket has been submitted",
      message: "Our team has received your request and will follow up through this email address.",
      detail: "Keep the tracking number below when contacting us about this request.",
      details: [
        { label: "Tracking number", value: trackingNumber },
        { label: "Submitted", value: createdAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" }) + " Manila time" },
      ],
      warning: "Do not send passwords, OTP codes, or financial credentials in support messages.",
    });
    await sendEmail(supportEmail, "support_ticket_internal", {
      subject: `New website support ticket ${trackingNumber}`,
      eyebrow: "INTERNAL SUPPORT ALERT",
      title: "A new support ticket needs review",
      message: `A visitor submitted a support request from ${recipient}.`,
      detail: messagePreview,
      details: [
        { label: "Tracking number", value: trackingNumber },
        { label: "Contact email", value: recipient },
      ],
      warning: "Verify the requester before discussing account-sensitive information.",
      disclaimer: "Internal DYESABEL PH operational notification.",
    });
    return {
      success: true,
      trackingNumber,
      timestampManila: createdAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
      referenceId: customerReferenceId,
    };
  } catch (error) {
    // Keep the ticket: external email delivery is not a reason to discard a
    // successfully accepted support request.
    throw error;
  }
}

async function sendAdminNotification(request: Request, body: Record<string, unknown>) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data, error: userError } = await admin.auth.getUser(token);
  if (userError || !data.user) throw new Error("Authentication required.");
  const role = String(data.user.app_metadata?.role || "");
  if (!["admin", "editor"].includes(role)) throw new Error("Insufficient permission.");

  const template = text(body.template, 60).toLowerCase();
  const allowed = ["donation_receipt", "partnership_confirmation", "general_notification"];
  if (!allowed.includes(template)) throw new Error("Unsupported application email template.");
  const recipient = email(body.to);
  const fields = typeof body.fields === "object" && body.fields ? body.fields as Record<string, unknown> : {};
  const title = text(fields.title || (
    template === "donation_receipt" ? "Thank you for your donation" :
    template === "partnership_confirmation" ? "Partnership inquiry received" :
    "A message from DYESABEL PH"
  ), 160);
  const details = Array.isArray(fields.details)
    ? fields.details.slice(0, 20).map((item) => ({
        label: text((item as Record<string, unknown>)?.label, 80),
        value: text((item as Record<string, unknown>)?.value, 1000),
      })).filter((item) => item.label && item.value)
    : [];
  const referenceId = await sendEmail(recipient, template, {
    subject: text(fields.subject || title, 140),
    eyebrow: text(fields.eyebrow || "DYESABEL PH", 80),
    title,
    message: text(fields.message, 4000),
    detail: text(fields.detail, 4000),
    warning: text(fields.warning, 2000),
    buttonLabel: text(fields.buttonLabel, 50),
    actionUrl: text(fields.actionUrl, 2000),
    details,
  });
  return { success: true, referenceId };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  if (!gasUrl || !gasSecret || !supabaseUrl || !serverKey) {
    return json({ success: false, error: "Application email service is not configured." }, 500);
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action, 80);
    const result =
      action === "subscribeNewsletter" ? await subscribeNewsletter(body) :
      action === "createSupportTicket" ? await createSupportTicket(body) :
      action === "sendAdminNotification" ? await sendAdminNotification(request, body) :
      (() => { throw new Error("Unsupported application email action."); })();
    return json(result);
  } catch (error) {
    console.error("application-email:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Application email request failed.",
    }, 400);
  }
});
