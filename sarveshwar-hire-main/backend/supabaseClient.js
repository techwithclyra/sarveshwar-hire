import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Backend read access to the problem bank (see ../supabase-migration.sql).
// Candidate storage is written directly from the frontend; this is the one
// place the server itself talks to Supabase, so it can look up test cases
// and ideal traits for /api/evaluate without trusting client-supplied data.
export const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Service-role client — the only client allowed to read/write the
// `students` table, which has no RLS policies for the anon/publishable key
// (see ../supabase-migration.sql). Holds password hashes; never expose
// SUPABASE_SERVICE_ROLE_KEY to the frontend.
export const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;
