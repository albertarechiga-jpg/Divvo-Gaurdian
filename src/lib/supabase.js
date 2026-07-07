export const SB_URL = import.meta.env.VITE_SUPABASE_URL;
export const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const sbHeaders = (extra = {}) => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  ...extra,
});

// Same shape as sbHeaders(), but carries a real logged-in user's access token
// as the bearer instead of the anon key — this is what lets RLS policies
// resolve auth.uid() to the actual caller, so a user only ever reads their
// own row (see the v2 users/user_roles RLS policies in
// supabase_migration_001_mission_engine.sql).
export const authHeaders = (accessToken, extra = {}) => ({
  apikey: SB_KEY,
  Authorization: `Bearer ${accessToken}`,
  ...extra,
});
