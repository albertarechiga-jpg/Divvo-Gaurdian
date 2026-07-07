import { createClient } from "@supabase/supabase-js";
import { SB_URL, SB_KEY } from "./supabase.js";

// The one real supabase-js client instance in this app — used ONLY for
// supabase.auth.* calls (session persistence, token refresh, onAuthStateChange
// are not worth hand-rolling). Every other Supabase call in this codebase
// stays a raw fetch against the REST endpoint (see supabase.js/sbHeaders()).
export const supabase = createClient(SB_URL, SB_KEY);
