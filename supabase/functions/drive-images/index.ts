import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GAS_URL =
  Deno.env.get("DRIVE_GAS_URL") ||
  "https://script.google.com/macros/s/AKfycbxxPZrdueZqgBRGmhgmCQlQykRxYMkzyc42mVIdqi6PbE92NpRj8AmjFmqeBj8deoMV/exec";
const CRUD_SECRET = Deno.env.get("DRIVE_CRUD_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getClaims(request: Request): Record<string, unknown> {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const payload = token.split(".")[1] || "";
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return {};
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!CRUD_SECRET) throw new Error("DRIVE_CRUD_SECRET is not configured in Supabase.");
    const claims = getClaims(request);
    const appMetadata = (claims.app_metadata || {}) as Record<string, unknown>;
    if (!["admin", "editor", "chapter_head"].includes(String(appMetadata.role || ""))) {
      return Response.json({ success: false, error: "Forbidden." }, { status: 403, headers: corsHeaders });
    }

    const payload = await request.json();
    const gasResponse = await fetch(GAS_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, secret: CRUD_SECRET }),
    });
    const text = await gasResponse.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("The Drive Apps Script returned a non-JSON response.");
    }
    return Response.json(data, {
      status: gasResponse.ok && data.success !== false ? 200 : 400,
      headers: corsHeaders,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: corsHeaders },
    );
  }
});
