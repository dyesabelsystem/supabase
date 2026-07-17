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
    if (callerError || !callerData.user) return json({ success: false, error: "Unauthorized." }, 401);
    const { data: caller } = await admin.from("profiles").select("role").eq("auth_user_id", callerData.user.id).single();
    if (caller?.role !== "admin") return json({ success: false, error: "Admin access required." }, 403);

    const body = await request.json();
    const action = String(body.action || "");
    if (action === "listUsers") {
      const { data, error } = await admin.from("profiles").select("legacy_user_id,username,email,role,chapter_id,pillar_id").order("username");
      if (error) throw error;
      return Response.json({ success: true, users: (data || []).map(mapProfile) }, { headers: cors });
    }
    if (action === "createUser") {
      const username = normalizeUsername(body.username);
      const email = normalizeEmail(body.email);
      const assignment = normalizeAssignment(body.role, body.chapterId, body.pillarId);
      const password = String(body.password || "");
      const validationError = passwordValidationError(password, username, email);
      if (validationError) throw new Error(validationError);
      const metadata = appMetadata(assignment.role, assignment.chapterId, assignment.pillarId);
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: metadata,
        user_metadata: userMetadata(username),
      });
      if (error || !created.user) throw error || new Error("User creation failed.");
      const legacyId = `dyesabel-${String(new Date().getFullYear()).slice(-2)}-${crypto.randomUUID().slice(0, 8)}`;
      const { data: profile, error: profileError } = await admin.from("profiles").insert({
        auth_user_id: created.user.id, legacy_user_id: legacyId, username,
        email: created.user.email, role: assignment.role,
        chapter_id: assignment.chapterId || null, pillar_id: assignment.pillarId || null,
      }).select("legacy_user_id,username,email,role,chapter_id,pillar_id").single();
      if (profileError) { await admin.auth.admin.deleteUser(created.user.id); throw profileError; }
      return Response.json({ success: true, user: mapProfile(profile) }, { headers: cors });
    }
    const { data: profile, error: profileLookupError } = await admin.from("profiles").select("*").eq("legacy_user_id", body.userId).single();
    if (profileLookupError || !profile?.auth_user_id) throw new Error("User not found.");
    if (action === "sendPasswordReset") {
      const redirectTo = normalizeRecoveryRedirect(body.redirectTo);
      const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(profile.auth_user_id);
      if (authUserError || !authUser.user?.email) throw authUserError || new Error("The account has no sign-in email.");
      const email = normalizeEmail(authUser.user.email);
      const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      return Response.json({ success: true, message: `Password reset email sent to ${email}.` }, { headers: cors });
    }
    if (action === "updateUser" || action === "updatePassword") {
      const attributes: Record<string, unknown> = {};
      if (body.email) attributes.email = String(body.email).trim().toLowerCase();
      if (action === "updatePassword") {
        const newPassword = String(body.newPassword || "");
        const validationError = passwordValidationError(newPassword, profile.username, profile.email);
        if (validationError) throw new Error(validationError);
        attributes.password = newPassword;
      }
      if (action === "updateUser") {
        const username = normalizeUsername(body.username);
        const email = normalizeEmail(body.email);
        const assignment = normalizeAssignment(body.role, body.chapterId, body.pillarId);
        if (profile.auth_user_id === callerData.user.id && assignment.role !== "admin") {
          throw new Error("You cannot remove your own administrator access.");
        }
        if (profile.role === "admin" && assignment.role !== "admin") await requireAnotherAdmin(admin, profile.id);
        attributes.email = email;
        attributes.app_metadata = appMetadata(assignment.role, assignment.chapterId, assignment.pillarId);
        attributes.user_metadata = userMetadata(username);
      }
      const { error } = await admin.auth.admin.updateUserById(profile.auth_user_id, attributes);
      if (error) throw error;
      if (action === "updateUser") {
        const assignment = normalizeAssignment(body.role, body.chapterId, body.pillarId);
        const { data: updated, error: profileError } = await admin.from("profiles")
          .update({
            username: normalizeUsername(body.username),
            email: normalizeEmail(body.email),
            role: assignment.role,
            chapter_id: assignment.chapterId || null,
            pillar_id: assignment.pillarId || null,
            updated_at: new Date().toISOString(),
          })
          .select("legacy_user_id,username,email,role,chapter_id,pillar_id")
          .eq("id", profile.id)
          .single();
        if (profileError) throw profileError;
        return Response.json({ success: true, user: mapProfile(updated) }, { headers: cors });
      }
      return Response.json({ success: true, message: "Password updated successfully." }, { headers: cors });
    }
    if (action === "deleteUser") {
      if (profile.auth_user_id === callerData.user.id) throw new Error("You cannot delete your own account.");
      if (profile.role === "admin") await requireAnotherAdmin(admin, profile.id);
      const { error } = await admin.auth.admin.deleteUser(profile.auth_user_id);
      if (error) throw error;
      return Response.json({ success: true }, { headers: cors });
    }
    throw new Error("Unsupported user action.");
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 400, headers: cors });
  }
});

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function normalizeUsername(value: unknown) {
  const username = String(value || "").trim().replace(/\s+/g, " ");
  if (username.length < 2 || username.length > 80) throw new Error("Name must be between 2 and 80 characters.");
  return username;
}

function normalizeEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  return email;
}

function userMetadata(username: string) {
  return { username, display_name: username, full_name: username, name: username };
}

async function requireAnotherAdmin(admin: ReturnType<typeof createClient>, excludedProfileId: string) {
  const { count, error } = await admin.from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .neq("id", excludedProfileId);
  if (error) throw error;
  if (!count) throw new Error("The final administrator account cannot be demoted or deleted.");
}

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

function passwordValidationError(password: string, username?: unknown, email?: unknown) {
  const requirements = [
    [password.length >= 12, "at least 12 characters"],
    [/[a-z]/.test(password), "one lowercase letter"],
    [/[A-Z]/.test(password), "one uppercase letter"],
    [/\d/.test(password), "one number"],
    [/[^A-Za-z0-9\s]/.test(password), "one symbol"],
    [!/[\s]/.test(password), "no spaces"],
  ] as const;
  const unmet = requirements.filter(([met]) => !met).map(([, label]) => label);
  if (unmet.length) return `Password must include: ${unmet.join(", ")}.`;

  const normalizedPassword = password.toLowerCase();
  const normalizedUsername = String(username || "").trim().toLowerCase();
  const emailName = String(email || "").split("@")[0].trim().toLowerCase();
  if (normalizedUsername.length >= 4 && normalizedPassword.includes(normalizedUsername)) return "Password must not contain the user name.";
  if (emailName.length >= 4 && normalizedPassword.includes(emailName)) return "Password must not contain the email name.";
  return null;
}

function normalizeRecoveryRedirect(value: unknown) {
  const fallback = "https://www.dyesabelph.org/reset-password";
  try {
    const redirect = new URL(String(value || fallback));
    const isProduction = redirect.protocol === "https:"
      && ["dyesabelph.org", "www.dyesabelph.org"].includes(redirect.hostname);
    const isLocal = ["localhost", "127.0.0.1"].includes(redirect.hostname)
      && ["http:", "https:"].includes(redirect.protocol);
    if (!isProduction && !isLocal) return fallback;
    redirect.pathname = "/reset-password";
    redirect.search = "";
    redirect.hash = "";
    return redirect.toString();
  } catch {
    return fallback;
  }
}
