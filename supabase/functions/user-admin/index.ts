import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: callerData, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !callerData.user) throw new Error("Unauthorized.");
    const { data: caller } = await admin.from("profiles").select("role").eq("auth_user_id", callerData.user.id).single();
    if (caller?.role !== "admin") return Response.json({ success: false, error: "Admin access required." }, { status: 403, headers: cors });

    const body = await request.json();
    const action = String(body.action || "");
    if (action === "listUsers") {
      const { data, error } = await admin.from("profiles").select("legacy_user_id,username,email,role,chapter_id,pillar_id").order("username");
      if (error) throw error;
      return Response.json({ success: true, users: (data || []).map(mapProfile) }, { headers: cors });
    }
    if (action === "createUser") {
      const assignment = normalizeAssignment(body.role, body.chapterId, body.pillarId);
      const metadata = appMetadata(assignment.role, assignment.chapterId, assignment.pillarId);
      const { data: created, error } = await admin.auth.admin.createUser({
        email: String(body.email || "").trim().toLowerCase(),
        password: String(body.password || ""),
        email_confirm: true,
        app_metadata: metadata,
        user_metadata: { username: body.username, display_name: body.username, full_name: body.username, name: body.username },
      });
      if (error || !created.user) throw error || new Error("User creation failed.");
      const legacyId = `dyesabel-${String(new Date().getFullYear()).slice(-2)}-${crypto.randomUUID().slice(0, 4)}`;
      const { data: profile, error: profileError } = await admin.from("profiles").insert({
        auth_user_id: created.user.id, legacy_user_id: legacyId, username: body.username,
        email: created.user.email, role: assignment.role,
        chapter_id: assignment.chapterId || null, pillar_id: assignment.pillarId || null,
      }).select("legacy_user_id,username,email,role,chapter_id,pillar_id").single();
      if (profileError) { await admin.auth.admin.deleteUser(created.user.id); throw profileError; }
      return Response.json({ success: true, user: mapProfile(profile) }, { headers: cors });
    }
    const { data: profile, error: profileLookupError } = await admin.from("profiles").select("*").eq("legacy_user_id", body.userId).single();
    if (profileLookupError || !profile?.auth_user_id) throw new Error("User not found.");
    if (action === "updateUser" || action === "updatePassword") {
      const attributes: Record<string, unknown> = {};
      if (body.email) attributes.email = String(body.email).trim().toLowerCase();
      if (body.newPassword) attributes.password = String(body.newPassword);
      if (action === "updateUser") {
        const assignment = normalizeAssignment(body.role, body.chapterId, body.pillarId);
        attributes.app_metadata = appMetadata(assignment.role, assignment.chapterId, assignment.pillarId);
        attributes.user_metadata = { username: body.username, display_name: body.username, full_name: body.username, name: body.username };
      }
      const { error } = await admin.auth.admin.updateUserById(profile.auth_user_id, attributes);
      if (error) throw error;
      if (action === "updateUser") {
        const { data: updated, error: profileError } = await admin.from("profiles")
          .select("legacy_user_id,username,email,role,chapter_id,pillar_id")
          .eq("id", profile.id)
          .single();
        if (profileError) throw profileError;
        return Response.json({ success: true, user: mapProfile(updated) }, { headers: cors });
      }
      return Response.json({ success: true }, { headers: cors });
    }
    if (action === "deleteUser") {
      if (profile.auth_user_id === callerData.user.id) throw new Error("You cannot delete your own account.");
      const { error } = await admin.auth.admin.deleteUser(profile.auth_user_id);
      if (error) throw error;
      return Response.json({ success: true }, { headers: cors });
    }
    throw new Error("Unsupported user action.");
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 400, headers: cors });
  }
});

function normalizeAssignment(roleValue: unknown, chapterValue?: unknown, pillarValue?: unknown) {
  const role = String(roleValue || "").trim();
  const chapterId = String(chapterValue || "").trim();
  const pillarId = String(pillarValue || "").trim();
  if (!["admin", "editor", "pillar_editor", "chapter_head", "member"].includes(role)) {
    throw new Error("Invalid user role.");
  }
  if (role === "pillar_editor" && !pillarId) throw new Error("Pillar editors require a pillar assignment.");
  if (role === "pillar_editor" && chapterId) throw new Error("Pillar editors cannot be assigned to a chapter.");
  if ((role === "chapter_head" || role === "member") && !chapterId) throw new Error("This role requires a chapter assignment.");
  if (role !== "pillar_editor" && pillarId) throw new Error("Only pillar editors can have a pillar assignment.");
  if (role === "admin" && chapterId) throw new Error("Admins cannot be assigned to a chapter.");
  return { role, chapterId, pillarId };
}
function appMetadata(role: string, chapterId?: string, pillarId?: string) {
  return {
    role,
    ...(chapterId ? { chapter_id: chapterId } : {}),
    ...(pillarId ? { pillar_id: pillarId } : {})
  };
}
function mapProfile(row: Record<string, unknown>) {
  return {
    id: row.legacy_user_id, username: row.username, email: row.email, role: row.role,
    chapterId: row.chapter_id || undefined, pillarId: row.pillar_id || undefined
  };
}
