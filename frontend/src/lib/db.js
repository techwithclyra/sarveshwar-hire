import { supabase } from "./supabaseClient.js";

function rowToProblem(row) {
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
    createdAt: row.created_at,
  };
}

function problemToRow(p) {
  return {
    id: p.id,
    title: p.title,
    difficulty: p.difficulty,
    statement: p.statement,
    constraints: p.constraints,
    input_format: p.inputFormat,
    output_format: p.outputFormat,
    ideal_traits: p.idealTraits || [],
    test_cases: p.testCases || [],
    unordered: !!p.unordered,
    time_limit_minutes: p.timeLimitMinutes ?? 3,
    timer_enabled: p.timerEnabled !== false,
    created_at: p.createdAt,
  };
}

function rowToCandidate(row) {
  return { id: row.id, name: row.name, dept: row.dept, college: row.college, createdAt: row.created_at, attempts: row.attempts || [], inProgress: row.in_progress || [] };
}

function rowToAssignment(row) {
  return {
    id: row.id,
    title: row.title,
    targetType: row.target_type,
    targetStudentIds: row.target_student_ids || [],
    targetCollege: row.target_college || "",
    targetDepartment: row.target_department || "",
    targetBatch: row.target_batch || "",
    problemMode: row.problem_mode,
    problemIds: row.problem_ids || [],
    difficultyFilter: row.difficulty_filter || "Mixed",
    timeLimitMinutes: row.time_limit_minutes ?? 3,
    startAt: row.start_at,
    endAt: row.end_at,
    maxAttempts: row.max_attempts ?? 1,
    allowRevisit: row.allow_revisit !== false,
    active: row.active !== false,
    createdAt: row.created_at,
  };
}

function assignmentToRow(a) {
  return {
    id: a.id,
    title: a.title,
    target_type: a.targetType,
    target_student_ids: a.targetStudentIds || [],
    target_college: a.targetCollege || null,
    target_department: a.targetDepartment || null,
    target_batch: a.targetBatch || null,
    problem_mode: a.problemMode,
    problem_ids: a.problemIds || [],
    difficulty_filter: a.difficultyFilter || null,
    time_limit_minutes: a.timeLimitMinutes ?? 3,
    start_at: a.startAt || null,
    end_at: a.endAt || null,
    max_attempts: a.maxAttempts ?? 1,
    allow_revisit: a.allowRevisit !== false,
    active: a.active !== false,
    created_at: a.createdAt,
  };
}

// Persistent storage layer — candidates, the problem bank, and assignments
// all live in Supabase so the Admin Panel sees the same data from any
// browser. (Student accounts are the one exception — see studentsApi.js.)
export const DB = {
  async saveCandidate(c) {
    if (!supabase) return;
    try {
      await supabase.from("candidates").upsert({
        id: c.id, name: c.name, dept: c.dept, college: c.college,
        created_at: c.createdAt, attempts: c.attempts || [], in_progress: c.inProgress || [],
      });
    } catch (e) { /* swallow — surfaced via UI where relevant */ }
  },
  async getCandidate(id) {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.from("candidates").select("*").eq("id", id).maybeSingle();
      if (error || !data) return null;
      return rowToCandidate(data);
    } catch (e) { return null; }
  },
  async allCandidates() {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase.from("candidates").select("*").order("created_at", { ascending: false });
      if (error) return [];
      return data.map(rowToCandidate);
    } catch (e) { return []; }
  },
  async deleteCandidate(id) {
    if (!supabase) return;
    try {
      await supabase.from("candidates").delete().eq("id", id);
    } catch (e) { /* swallow */ }
  },

  async listProblems() {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase.from("problems").select("*").order("created_at", { ascending: true });
      if (error) return [];
      return data.map(rowToProblem);
    } catch (e) { return []; }
  },
  async saveProblem(p) {
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase.from("problems").upsert(problemToRow(p));
    if (error) throw new Error(error.message);
  },
  async deleteProblem(id) {
    if (!supabase) return;
    try {
      await supabase.from("problems").delete().eq("id", id);
    } catch (e) { /* swallow */ }
  },

  async listAssignments() {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase.from("assignments").select("*").order("created_at", { ascending: false });
      if (error) return [];
      return data.map(rowToAssignment);
    } catch (e) { return []; }
  },
  async saveAssignment(a) {
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase.from("assignments").upsert(assignmentToRow(a));
    if (error) throw new Error(error.message);
  },
  async deleteAssignment(id) {
    if (!supabase) return;
    try {
      await supabase.from("assignments").delete().eq("id", id);
    } catch (e) { /* swallow */ }
  },
};
