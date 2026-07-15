import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GAS_URL =
  Deno.env.get("DRIVE_GAS_URL") ||
  "https://script.google.com/macros/s/AKfycbxxPZrdueZqgBRGmhgmCQlQykRxYMkzyc42mVIdqi6PbE92NpRj8AmjFmqeBj8deoMV/exec";
const CRUD_SECRET = Deno.env.get("DRIVE_CRUD_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!CRUD_SECRET) throw new Error("DRIVE_CRUD_SECRET is not configured in Supabase.");
    const payload = await request.json();
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) {
      return Response.json({ success: false, error: "Unauthorized." }, { status: 401, headers: corsHeaders });
    }

    const appMetadata = userData.user.app_metadata || {};
    const role = String(appMetadata.role || "");
    if (!["admin", "editor", "chapter_head", "pillar_editor"].includes(role)) {
      return Response.json({ success: false, error: "Forbidden." }, { status: 403, headers: corsHeaders });
    }

    if (role === "pillar_editor") {
      const action = String(payload.action || "").toLowerCase();
      const pillarId = String(appMetadata.pillar_id || "").trim();
      if (!pillarId || !["upload", "delete"].includes(action)) {
        return Response.json({ success: false, error: "Pillar editors can only upload or replace images for their assigned pillar." }, { status: 403, headers: corsHeaders });
      }
      if (action === "delete") {
        const fileId = String(payload.fileId || "").trim();
        const { data: content, error: contentError } = await admin
          .from("site_content")
          .select("data")
          .eq("content_key", "pillars")
          .single();
        if (contentError) throw contentError;
        const pillars = Array.isArray(content.data) ? content.data : [];
        const assignedPillar = pillars.find((pillar: Record<string, unknown>) => String(pillar?.id || "") === pillarId);
        if (!fileId || !assignedPillar || !JSON.stringify(assignedPillar).includes(fileId)) {
          return Response.json({ success: false, error: "That image does not belong to the assigned pillar." }, { status: 403, headers: corsHeaders });
        }
      }
    }

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
