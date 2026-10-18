import { createClient } from "jsr:@supabase/supabase-js@2";

// Service-role client — never import this file from anything that ships to
// the browser. Edge Functions only; SUPABASE_SERVICE_ROLE_KEY is set as a
// function secret (supabase secrets set), never VITE_-prefixed, never in
// src/.
export function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set for this function");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
