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

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Fires immediately with the current session, then again on every
// login/logout/token-refresh. Returns the underlying subscription so callers
// can unsubscribe on unmount.
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}

// Reads the caller's own users row + role(s) — RLS (via authHeaders' bearer
// token) guarantees this can only ever return the logged-in user's own row.
export async function fetchCurrentUser(accessToken, userId) {
  try {
    const res = await fetch(
      // user_roles has two FKs to users (user_id, granted_by) — the "!user_id"
      // hint tells PostgREST which relationship to embed; without it the
      // request 400s (PGRST201, ambiguous embed).
      `${SB_URL}/rest/v1/users?select=id,full_name,email,organization_id,user_roles!user_id(role)&id=eq.${userId}`,
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
      roles,
      role: roles.includes("admin") ? "admin" : roles[0] || "viewer",
    };
  } catch (err) {
    console.error("fetchCurrentUser threw:", err);
    return null;
  }
}
