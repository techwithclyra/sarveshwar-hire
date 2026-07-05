import { supabase } from "./supabaseClient.js";

// The problem bank now lives in Supabase (see ../supabase-migration.sql) and
// is managed entirely from the Admin Panel — no problems are bundled with
// the code, so a fresh deployment starts with an empty set until an admin
// adds some.
function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    difficulty: row.difficulty,
    statement: row.statement,
    constraints: row.constraints,
    inputFormat: row.input_format,
    outputFormat: row.output_format,
    idealTraits: row.ideal_traits || [],
    testCases: row.test_cases || [],
    unordered: !!row.unordered,
    timeLimitMinutes: row.time_limit_minutes ?? 3,
    timerEnabled: row.timer_enabled !== false,
  };
}

export async function getProblems() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("problems").select("*").order("created_at", { ascending: true });
  if (error) return [];
  return data.map(mapRow);
}

export async function getProblemById(id) {
  if (!supabase) return null;
  const { data, error } = await supabase.from("problems").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}
