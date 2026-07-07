import { createClient } from "@supabase/supabase-js";
import { SB_URL, SB_KEY } from "./supabase.js";

// The one real supabase-js client instance in this app — used ONLY for
// supabase.auth.* calls (session persistence, token refresh, onAuthStateChange
// are not worth hand-rolling). Every other Supabase call in this codebase
// stays a raw fetch against the REST endpoint (see supabase.js/sbHeaders()).
//
// flowType: "pkce" — the implicit flow's recovery/invite links are single-use
// tokens embedded directly in the URL, which email security scanners (Gmail
// Safe Browsing, corporate link scanners) silently "click" server-side to
// prescan for malware, burning the token before the real user ever opens it
// (surfaces as an "otp_expired" error on first genuine click). PKCE instead
// exchanges a `code` for a session using a verifier secret stored only in
// the browser that requested it, which a server-side prefetch can't hold.
export const supabase = createClient(SB_URL, SB_KEY, {
  auth: { flowType: "pkce" },
});
