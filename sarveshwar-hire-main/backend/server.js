import express from "express";
import cors from "cors";
import { getProblems, getProblemById } from "./problems.js";
import { listStudents, createStudent, updateStudent, deleteStudent, verifyLogin, signupStudent } from "./students.js";

const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
app.use(express.json({ limit: "1mb" }));

// Candidate storage now lives in Supabase (see ../supabase-migration.sql
// and frontend/src/lib/db.js) — this backend only proxies the Gemini
// call so the API key never reaches the browser.

// Same prototype-grade trust model as the rest of the app (client-side
// admin password gate) — the Admin Panel sends the admin password back as
// a header so the student-roster endpoints below aren't wide open to
// anonymous requests. Set ADMIN_PASSWORD in backend/.env to match
// frontend/src/config/constants.js.
function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD || req.get("x-admin-key") !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ---------------------------------------------------------------------------
// Student auth — the only place the backend touches passwords. Credentials
// are verified server-side against bcrypt hashes in Supabase; the browser
// never sees a hash, and the students table has no client-readable RLS
// policy at all (see ../supabase-migration.sql).
// ---------------------------------------------------------------------------
app.post("/api/auth/login", async (req, res) => {
  // `username` accepts either a username or an email (see verifyLogin).
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Email and password are required" });
  try {
    const student = await verifyLogin(username, password);
    if (!student) return res.status(401).json({ error: "Invalid email or password" });
    res.json(student);
  } catch (e) {
    res.status(500).json({ error: e.message || "Login failed" });
  }
});

// Self-serve registration for students new to the platform.
app.post("/api/auth/signup", async (req, res) => {
  const { name, email, college, department, batch, password } = req.body || {};
  if (!name || !email || !college || !department || !password) {
    return res.status(400).json({ error: "Name, email, college, department, and password are required" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  try {
    const student = await signupStudent({ name, email, college, department, batch, password });
    res.json(student);
  } catch (e) {
    // Duplicate-email is an expected, user-facing case, not a server fault.
    const dup = /already exists/i.test(e.message || "");
    res.status(dup ? 409 : 500).json({ error: e.message || "Could not create account" });
  }
});

app.get("/api/admin/students", requireAdmin, async (_req, res) => {
  try { res.json(await listStudents()); } catch (e) { res.status(500).json({ error: e.message || "Could not list students" }); }
});

app.post("/api/admin/students", requireAdmin, async (req, res) => {
  const { name, email, college, department, batch, username, password } = req.body || {};
  if (!name || !email || !college || !department || !username || !password) {
    return res.status(400).json({ error: "name, email, college, department, username, and password are required" });
  }
  try { res.json(await createStudent({ name, email, college, department, batch, username, password })); }
  catch (e) { res.status(500).json({ error: e.message || "Could not create student" }); }
});

app.put("/api/admin/students/:id", requireAdmin, async (req, res) => {
  try { res.json(await updateStudent(req.params.id, req.body || {})); }
  catch (e) { res.status(500).json({ error: e.message || "Could not update student" }); }
});

app.delete("/api/admin/students/:id", requireAdmin, async (req, res) => {
  try { await deleteStudent(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message || "Could not delete student" }); }
});

// Fixed prompt-engineering rubric the AI grades every submission against,
// regardless of which problem it is — this is what makes the score about
// how the student prompts, not just whether the code runs.
const PROMPT_CRITERIA = [
  "Role Prompting - did they assign the AI a clear role/persona?",
  "Task Clarity - is the task stated unambiguously?",
  "Context Quality - is enough background/context given?",
  "Constraints - are limits, edge cases, and non-goals specified?",
  "Output Specification - is the expected output precisely defined?",
  "Logical Structure - is the prompt organized and easy to follow?",
  "Prompt Completeness - does the prompt cover role, goal, context, constraints, and output format, not just a bare task description?",
  "Precision - is the language specific rather than vague?",
  "Ambiguity Detection - free of contradictory or unclear instructions?",
  "Hallucination Prevention - does it guard against the AI inventing unstated behavior?",
  "Step-by-step Instructions - does it ask for a reasoning/approach before code?",
  "Formatting Instructions - does it specify exact code/output formatting?",
];

// Tolerant JSON extraction. Even with responseMimeType set, models can wrap
// output in ```json fences or add stray prose; this strips fences and, as a
// last resort, parses the outermost {...} span. Returns null if nothing
// parses, so the caller can surface a friendly "try again" instead of a raw
// JSON.parse stack trace.
function parseEvaluation(raw) {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(cleaned); } catch (_) { /* fall through */ }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) { /* fall through */ }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Evaluation proxy — the browser never sees the Gemini API key. The
// problem definition is looked up server-side too, so a candidate can't
// tamper with test cases or ideal traits via devtools.
// ---------------------------------------------------------------------------
app.post("/api/evaluate", async (req, res) => {
  const { prompt, problemId } = req.body || {};
  const problem = await getProblemById(problemId);
  if (!prompt || typeof prompt !== "string" || !problem) {
    return res.status(400).json({ error: "prompt and a valid problemId are required" });
  }
  if (!GEMINI_API_KEY) return res.status(500).json({ error: "Server is missing GEMINI_API_KEY (set it in backend/.env)" });

  const traits = (problem.idealTraits || []).map((t, i) => `${i + 1}. ${t}`).join("\n") || "(none specified)";
  const criteria = PROMPT_CRITERIA.map((c, i) => `${i + 1}. ${c}`).join("\n");

  const sys = `You are the evaluation engine of a platform that assesses a student's PROMPT ENGINEERING skill — not just whether the resulting code works.

PROBLEM
Title: ${problem.title}
Statement: ${problem.statement}
Constraints: ${problem.constraints}
Input format: ${problem.inputFormat}
Output format: ${problem.outputFormat}
Traits an excellent prompt for this problem would include (for grounding your judgment, not a checklist to output):
${traits}

THE STUDENT WROTE THIS PROMPT
"""${prompt}"""

Do ALL of the following:
1. Write a JavaScript solution based ONLY on what the student's prompt actually specifies. Exactly one function: function solve(input) { ... } where "input" is raw stdin as a string and it RETURNS stdout as a string. No markdown, no explanation inside the code. You must always output some runnable code — but do NOT use your own knowledge of the "ideal" algorithm to silently complete, correct, or rescue a vague or incomplete prompt. If the prompt is ambiguous, missing key details (algorithm choice, edge cases, exact output format), or under-specified, your code should faithfully reflect those exact gaps — e.g. a naive/brute-force approach if that's all that was implied, missing edge-case handling the prompt never asked for, or genuinely wrong behavior where the prompt itself was unclear or contradictory. Do not quietly produce a fully correct solution for a weak prompt. Only a clear, complete, well-specified prompt should result in fully correct, working code.
2. Judge the STUDENT'S PROMPT (not your code) against each of these 12 criteria, met true/false with a short note grounded in what they actually wrote (or didn't):
${criteria}
3. List 2-4 concrete strengths of the prompt.
4. List 2-4 concrete weaknesses of the prompt (empty array only if it is genuinely excellent).
5. List 2-4 concrete, actionable suggestions to improve the prompt.
6. Score code efficiency 0-100: given the problem's constraints (${problem.constraints}), is the solution's likely time/space complexity adequate? Give a one-sentence justification.

Reply with ONLY minified JSON, no fences:
{"code":"function solve(input){...}","promptRubric":[{"criterion":"<text>","met":true,"note":"<short>"}],"strengths":["..."],"weaknesses":["..."],"suggestions":["..."],"efficiencyScore":0,"efficiencyNote":"<short>","feedback":"<one short overall sentence>"}
Keep code compact.`;

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: sys }] }],
          generationConfig: {
            maxOutputTokens: 3072,
            thinkingConfig: { thinkingBudget: 0 },
            // Ask Gemini to emit strict JSON so we don't have to unwrap prose/fences.
            responseMimeType: "application/json",
          },
        }),
      }
    );
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: data?.error?.message || "Gemini API error" });
    const raw = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    if (!raw) throw new Error("The evaluator returned an empty response — please try running the evaluation again.");
    const parsed = parseEvaluation(raw);
    if (!parsed) throw new Error("The evaluator returned an unreadable response — please try running the evaluation again.");
    if (!parsed.code || !Array.isArray(parsed.promptRubric)) throw new Error("Malformed evaluation response");
    parsed.strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];
    parsed.weaknesses = Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [];
    parsed.suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    parsed.efficiencyScore = Number.isFinite(parsed.efficiencyScore) ? Math.max(0, Math.min(100, parsed.efficiencyScore)) : 50;
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message || "Evaluation failed" });
  }
});

app.get("/api/problems", async (_req, res) => {
  res.json(await getProblems());
});

// On Vercel this module is imported as a serverless handler (see the routes
// in ../vercel.json) and must NOT bind a port — an Express app is itself a
// valid (req, res) handler. Locally and on Render it listens normally.
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));
}

export default app;
