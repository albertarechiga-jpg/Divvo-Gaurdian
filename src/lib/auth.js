import { supabase } from "./supabaseClient.js";
import { SB_URL, authHeaders } from "./supabase.js";

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Public self-service signup. The company_id/full_name metadata lands in
// auth.users.raw_user_meta_data, where a security-definer trigger
// (handle_new_signup, see the signup migration) reads it to create the
// matching users/user_roles rows itself — scoped to a hardcoded 'viewer'
// role and an org resolved server-side from companies.organization_id, never
// trusted directly from this payload. Returns { session }, which is null if
// the project requires email confirmation (no session until they click the
// link) — the profile row exists either way since the trigger fires at
// auth.users insert time, not at confirmation time.
export async function signUp(email, password, { fullName, companyId }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, company_id: companyId } },
  });
  if (error) throw error;
  // Supabase returns a "successful" response with an empty identities array
  // for an already-registered email when confirmations are on, instead of a
  // real error (deliberate anti-enumeration behavior) — surface it as one.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error("An account with this email already exists. Try signing in instead.");
  }
  return { session: data.session };
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Emails a reset link; Supabase redirects the user back to `redirectTo` with
// a recovery token, which onAuthStateChange below surfaces as a
// "PASSWORD_RECOVERY" event.
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

// Only valid while a PASSWORD_RECOVERY session is active (see above).
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// Fires immediately with the current session, then again on every
// login/logout/token-refresh/password-recovery. Returns the underlying
// subscription so callers can unsubscribe on unmount.
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(session, event));
  return data.subscription;
}

// Reads the caller's own users row + role(s) — RLS (via authHeaders' bearer
// token) guarantees this can only ever return the logged-in user's own row.
export async function fetchCurrentUser(accessToken, userId) {
  try {
    const res = await fetch(
      // user_roles has two FKs to users (user_id, granted_by) — the "!user_id"
      // hint tells PostgREST which relationship to embed; without it the
      // request 400s (PGRST201, ambiguous embed). organizations has only one
      // FK from users (organization_id), so that embed needs no hint.
      `${SB_URL}/rest/v1/users?select=id,full_name,email,organization_id,organizations(is_platform_org),user_roles!user_id(role)&id=eq.${userId}`,
      { headers: authHeaders(accessToken) }
    );
    const rows = await res.json();
    if (!res.ok) {
      console.error("fetchCurrentUser failed:", res.status, rows);
      return null;
    }
    const row = rows?.[0];
    if (!row) return null;
    const roles = (row.user_roles || []).map((r) => r.role);
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      organizationId: row.organization_id,
      isPlatformOrg: row.organizations?.is_platform_org ?? false,
      roles,
      role: roles.includes("admin") ? "admin" : roles[0] || "viewer",
    };
  } catch (err) {
    console.error("fetchCurrentUser threw:", err);
    return null;
  }
}
