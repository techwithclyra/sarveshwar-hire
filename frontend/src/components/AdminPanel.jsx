import React, { useState, useEffect, useCallback, useRef } from "react";
import { Lock, LogOut, RefreshCw, Users, BarChart3, Trophy, Clock, Trash2, AlertTriangle, Code2, ListChecks, Pencil, Plus, ChevronDown, ChevronRight, GraduationCap, CalendarClock, Upload, Download, FileSpreadsheet, Eye, ThumbsUp, ThumbsDown, Lightbulb } from "lucide-react";
import { COLORS } from "../config/colors.js";
import { ADMIN_USERNAME, ADMIN_PASSWORD } from "../config/constants.js";
import { DB } from "../lib/db.js";
import { fmtDate, uid, gradeTone } from "../lib/util.js";
import { formatClock } from "../lib/timer.js";
import { parseWorkbookRows, downloadWorkbook } from "../lib/excel.js";
import { Pill, label, inputStyle } from "./ui.jsx";
import { AdminStudents } from "./AdminStudents.jsx";
import { AdminAssignments } from "./AdminAssignments.jsx";

function bestScore(candidate) {
  if (!candidate.attempts || !candidate.attempts.length) return null;
  return Math.max(...candidate.attempts.map((a) => a.overall));
}
function lastActivity(candidate) {
  if (!candidate.attempts || !candidate.attempts.length) return candidate.createdAt;
  return Math.max(...candidate.attempts.map((a) => a.at));
}

function AdminLogin({ onAuthed }) {
  const [username, setUsername] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  function submit() {
    if (username === ADMIN_USERNAME && pwd === ADMIN_PASSWORD) onAuthed();
    else setErr("Incorrect username or password.");
  }
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 360, maxWidth: "100%", background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Lock size={16} color={COLORS.gold} /><span style={{ fontSize: 17, fontWeight: 700 }}>Admin Access</span>
        </div>
        <p style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.5, marginTop: 0, marginBottom: 16 }}>Enter the admin username and password to view candidate results.</p>
        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={username} onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={inputStyle} placeholder="Username" autoComplete="username"
          />
          <input
            type="password" value={pwd} onChange={(e) => setPwd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={inputStyle} placeholder="Password" autoComplete="current-password"
          />
        </div>
        {err && <div style={{ color: COLORS.rose, fontSize: 12.5, marginTop: 12, display: "flex", gap: 6 }}><AlertTriangle size={13} style={{ marginTop: 1 }} />{err}</div>}
        <button onClick={submit} style={{ marginTop: 16, width: "100%", background: COLORS.gold, color: "#1A1300", border: "none", borderRadius: 8, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Unlock
        </button>
      </div>
    </div>
  );
}

function StatTile({ icon, tone, title, value }) {
  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: `rgba(${tone},0.12)`, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
      <div>
        <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{value}</div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
        padding: "8px 12px", borderRadius: 8, border: `1px solid ${active ? COLORS.gold : "transparent"}`,
        background: active ? "rgba(232,185,95,0.1)" : "transparent", color: active ? COLORS.gold : COLORS.muted,
      }}
    >
      {icon}{children}
    </button>
  );
}

function CandidatesTab() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [viewingKey, setViewingKey] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setCandidates(await DB.allCandidates());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(id) {
    if (!window.confirm("Remove this candidate and all of their attempts?")) return;
    await DB.deleteCandidate(id);
    load();
  }

  const scored = candidates.map((c) => ({ c, best: bestScore(c) })).filter((x) => x.best !== null);
  const avgScore = scored.length ? Math.round(scored.reduce((s, x) => s + x.best, 0) / scored.length) : 0;
  const topScore = scored.length ? Math.max(...scored.map((x) => x.best)) : 0;
  const sorted = [...candidates].sort((a, b) => (bestScore(b) ?? -1) - (bestScore(a) ?? -1));

  function exportReport() {
    const rows = [];
    for (const c of candidates) {
      for (const a of c.attempts || []) {
        rows.push({
          Name: c.name, Department: c.dept, College: c.college, Problem: a.title || a.problemId,
          OverallScore: a.overall, Grade: a.grade, PromptScore: a.promptScore, CodingScore: a.codingScore,
          TestsPassed: a.passed, TotalTests: a.total,
          StartedAt: a.startedAt ? new Date(a.startedAt).toISOString() : "",
          SubmittedAt: a.submittedAt || a.at ? new Date(a.submittedAt || a.at).toISOString() : "",
          TimeTakenSec: a.timeTakenSec ?? "", TimeRemainingSec: a.timeRemainingSec ?? "",
          SubmissionType: a.submissionType || "", Prompt: a.prompt || "", GeneratedCode: a.code || "", Feedback: a.feedback || "",
        });
      }
    }
    downloadWorkbook("submissions-report.xlsx", "Submissions", [
      { header: "Name", key: "Name" }, { header: "Department", key: "Department" }, { header: "College", key: "College" },
      { header: "Problem", key: "Problem", width: 30 }, { header: "Overall Score", key: "OverallScore", width: 14 },
      { header: "Grade", key: "Grade", width: 10 }, { header: "Prompt Score", key: "PromptScore", width: 14 },
      { header: "Coding Score", key: "CodingScore", width: 14 }, { header: "Tests Passed", key: "TestsPassed", width: 14 },
      { header: "Total Tests", key: "TotalTests", width: 12 }, { header: "Started At", key: "StartedAt", width: 22 },
      { header: "Submitted At", key: "SubmittedAt", width: 22 }, { header: "Time Taken (s)", key: "TimeTakenSec", width: 14 },
      { header: "Time Remaining (s)", key: "TimeRemainingSec", width: 16 }, { header: "Submission Type", key: "SubmissionType", width: 16 },
      { header: "Prompt", key: "Prompt", width: 50 }, { header: "Generated Code", key: "GeneratedCode", width: 50 }, { header: "AI Feedback", key: "Feedback", width: 40 },
    ], rows);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={exportReport} title="Export all submissions to .xlsx" style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.panelAlt, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, cursor: "pointer" }}>
          <Download size={13} />Export Report
        </button>
        <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.panelAlt, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, cursor: "pointer" }}>
          <RefreshCw size={13} />Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <StatTile icon={<Users size={16} color={COLORS.teal} />} tone="62,217,196" title="Candidates" value={candidates.length} />
        <StatTile icon={<BarChart3 size={16} color={COLORS.gold} />} tone="232,185,95" title="Avg Best Score" value={avgScore} />
        <StatTile icon={<Trophy size={16} color={COLORS.rose} />} tone="232,96,122" title="Top Score" value={topScore} />
      </div>

      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, flex: 1, overflowY: "auto" }}>
        <div style={label()}>Candidates</div>
        {loading ? (
          <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 10 }}>Loading…</div>
        ) : candidates.length === 0 ? (
          <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 10 }}>No candidates yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: COLORS.muted, fontSize: 11, textTransform: "uppercase" }}>
                <th style={{ padding: "6px 8px" }}></th>
                <th style={{ padding: "6px 8px" }}>Name</th>
                <th style={{ padding: "6px 8px" }}>Dept / College</th>
                <th style={{ padding: "6px 8px" }}><Code2 size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />Attempts</th>
                <th style={{ padding: "6px 8px" }}>Best Score</th>
                <th style={{ padding: "6px 8px" }}><Clock size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />Last Activity</th>
                <th style={{ padding: "6px 8px" }}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const best = bestScore(c);
                const expanded = expandedId === c.id;
                return (
                  <React.Fragment key={c.id}>
                    <tr style={{ borderTop: `1px solid ${COLORS.border}`, cursor: "pointer" }} onClick={() => setExpandedId(expanded ? null : c.id)}>
                      <td style={{ padding: "10px 8px", width: 20, color: COLORS.muted }}>
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td style={{ padding: "10px 8px", fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: "10px 8px", color: COLORS.muted }}>{c.dept} · {c.college}</td>
                      <td style={{ padding: "10px 8px" }}>{c.attempts?.length || 0}</td>
                      <td style={{ padding: "10px 8px" }}>
                        {best === null ? <span style={{ color: COLORS.muted }}>—</span> : <Pill tone={best >= 80 ? "teal" : best >= 60 ? "gold" : "rose"}>{best}</Pill>}
                      </td>
                      <td style={{ padding: "10px 8px", color: COLORS.muted }}>{fmtDate(lastActivity(c))}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right" }}>
                        <button onClick={(e) => { e.stopPropagation(); remove(c.id); }} title="Remove candidate" style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: 4 }}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={7} style={{ padding: "0 8px 14px 34px", background: COLORS.bg }}>
                          {!c.attempts?.length ? (
                            <div style={{ color: COLORS.muted, fontSize: 12, padding: "10px 0" }}>No submissions yet.</div>
                          ) : (
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, marginTop: 8 }}>
                              <thead>
                                <tr style={{ textAlign: "left", color: COLORS.muted, textTransform: "uppercase", fontSize: 10 }}>
                                  <th style={{ padding: "4px 6px" }}></th>
                                  <th style={{ padding: "4px 6px" }}>Problem</th>
                                  <th style={{ padding: "4px 6px" }}>Score</th>
                                  <th style={{ padding: "4px 6px" }}>Grade</th>
                                  <th style={{ padding: "4px 6px" }}>Started</th>
                                  <th style={{ padding: "4px 6px" }}>Submitted</th>
                                  <th style={{ padding: "4px 6px" }}>Time Taken</th>
                                  <th style={{ padding: "4px 6px" }}>Remaining</th>
                                  <th style={{ padding: "4px 6px" }}>Type</th>
                                </tr>
                              </thead>
                              <tbody>
                                {c.attempts.map((a, i) => {
                                  const key = `${c.id}__${i}`;
                                  const viewing = viewingKey === key;
                                  return (
                                    <React.Fragment key={i}>
                                      <tr style={{ borderTop: `1px solid ${COLORS.border}`, cursor: a.prompt ? "pointer" : "default" }} onClick={() => a.prompt && setViewingKey(viewing ? null : key)}>
                                        <td style={{ padding: "6px", color: COLORS.muted }}>{a.prompt && <Eye size={12} />}</td>
                                        <td style={{ padding: "6px" }}>{a.title || a.problemId}</td>
                                        <td style={{ padding: "6px" }}>{a.overall}</td>
                                        <td style={{ padding: "6px" }}>{a.grade && <Pill tone={gradeTone(a.grade)}>{a.grade}</Pill>}</td>
                                        <td style={{ padding: "6px", color: COLORS.muted }}>{a.startedAt ? fmtDate(a.startedAt) : "—"}</td>
                                        <td style={{ padding: "6px", color: COLORS.muted }}>{fmtDate(a.submittedAt || a.at)}</td>
                                        <td style={{ padding: "6px", color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>{a.timeTakenSec != null ? formatClock(a.timeTakenSec) : "—"}</td>
                                        <td style={{ padding: "6px", color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>{a.timeRemainingSec != null ? formatClock(a.timeRemainingSec) : "—"}</td>
                                        <td style={{ padding: "6px" }}>
                                          <Pill tone={a.submissionType === "auto" ? "rose" : "teal"}>{a.submissionType === "auto" ? "Auto (timeout)" : "Manual"}</Pill>
                                        </td>
                                      </tr>
                                      {viewing && (
                                        <tr>
                                          <td colSpan={9} style={{ padding: "10px 6px 16px 24px", background: COLORS.panel }}>
                                            <div style={{ display: "grid", gap: 10 }}>
                                              {a.feedback && <div style={{ fontSize: 12, color: COLORS.muted }}>{a.feedback}</div>}
                                              <div>
                                                <div style={{ fontSize: 10, textTransform: "uppercase", color: COLORS.muted, marginBottom: 4 }}>Submitted Prompt</div>
                                                <pre style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 10, fontSize: 11.5, color: COLORS.text, whiteSpace: "pre-wrap", fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>{a.prompt}</pre>
                                              </div>
                                              {a.code && (
                                                <div>
                                                  <div style={{ fontSize: 10, textTransform: "uppercase", color: COLORS.muted, marginBottom: 4 }}>Generated Code</div>
                                                  <pre style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 10, fontSize: 11, color: COLORS.muted, overflowX: "auto", fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>{a.code}</pre>
                                                </div>
                                              )}
                                              {(a.strengths?.length > 0 || a.weaknesses?.length > 0 || a.suggestions?.length > 0) && (
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                                                  {a.strengths?.length > 0 && (
                                                    <div>
                                                      <div style={{ fontSize: 10, textTransform: "uppercase", color: COLORS.teal, marginBottom: 4 }}>Strengths</div>
                                                      {a.strengths.map((s, si) => <div key={si} style={{ display: "flex", gap: 4, fontSize: 11, marginBottom: 3 }}><ThumbsUp size={11} color={COLORS.teal} style={{ marginTop: 2, flexShrink: 0 }} />{s}</div>)}
                                                    </div>
                                                  )}
                                                  {a.weaknesses?.length > 0 && (
                                                    <div>
                                                      <div style={{ fontSize: 10, textTransform: "uppercase", color: COLORS.rose, marginBottom: 4 }}>Weaknesses</div>
                                                      {a.weaknesses.map((w, wi) => <div key={wi} style={{ display: "flex", gap: 4, fontSize: 11, marginBottom: 3 }}><ThumbsDown size={11} color={COLORS.rose} style={{ marginTop: 2, flexShrink: 0 }} />{w}</div>)}
                                                    </div>
                                                  )}
                                                  {a.suggestions?.length > 0 && (
                                                    <div>
                                                      <div style={{ fontSize: 10, textTransform: "uppercase", color: COLORS.gold, marginBottom: 4 }}>Suggestions</div>
                                                      {a.suggestions.map((s, si) => <div key={si} style={{ display: "flex", gap: 4, fontSize: 11, marginBottom: 3 }}><Lightbulb size={11} color={COLORS.gold} style={{ marginTop: 2, flexShrink: 0 }} />{s}</div>)}
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const TIME_PRESETS = [3, 5, 10, 15, 30, 60];

const EMPTY_PROBLEM = {
  id: null, title: "", difficulty: "Medium", statement: "", constraints: "",
  inputFormat: "", outputFormat: "", idealTraitsText: "", testCasesText: "[]", unordered: false,
  timeLimitMinutes: 3, timerEnabled: true,
};

function problemToFormState(p) {
  return {
    id: p.id, title: p.title, difficulty: p.difficulty, statement: p.statement,
    constraints: p.constraints, inputFormat: p.inputFormat, outputFormat: p.outputFormat,
    idealTraitsText: (p.idealTraits || []).join("\n"),
    testCasesText: JSON.stringify(p.testCases || [], null, 2),
    unordered: !!p.unordered,
    timeLimitMinutes: p.timeLimitMinutes ?? 3,
    timerEnabled: p.timerEnabled !== false,
  };
}

const PROBLEM_TEMPLATE_COLUMNS = [
  { header: "Title", key: "Title" }, { header: "Difficulty", key: "Difficulty", width: 14 },
  { header: "Statement", key: "Statement", width: 40 }, { header: "Constraints", key: "Constraints" },
  { header: "InputFormat", key: "InputFormat" }, { header: "OutputFormat", key: "OutputFormat" },
  { header: "Unordered", key: "Unordered", width: 12 }, { header: "TimeLimitMinutes", key: "TimeLimitMinutes", width: 16 },
  { header: "TimerEnabled", key: "TimerEnabled", width: 14 },
  { header: "IdealTraits", key: "IdealTraits", width: 40 }, { header: "TestCases", key: "TestCases", width: 50 },
];

function downloadProblemTemplate() {
  downloadWorkbook("problems-template.xlsx", "Problems", PROBLEM_TEMPLATE_COLUMNS, [{
    Title: "Two Sum", Difficulty: "Easy", Statement: "Given an array and a target, return the two indices that sum to the target.",
    Constraints: "1 ≤ n ≤ 100000", InputFormat: "Line 1: n and target. Line 2: n integers.", OutputFormat: "Two indices, space-separated.",
    Unordered: "FALSE", TimeLimitMinutes: 5, TimerEnabled: "TRUE",
    IdealTraits: "Requests a hash-map approach\nStates O(n) time complexity",
    TestCases: '[{"input":"4 9\\n2 7 11 15","expected":"0 1"}]',
  }]);
}

function ProblemsTab() {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_PROBLEM);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setProblems(await DB.listProblems());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true); setImportSummary(null); setErr("");
    try {
      const rows = await parseWorkbookRows(file);
      let created = 0;
      const failures = [];
      for (const row of rows) {
        const title = String(row.Title || row.title || "").trim();
        const statement = String(row.Statement || row.statement || "").trim();
        if (!title || !statement) { failures.push(`${title || "(unnamed row)"}: title and statement are required`); continue; }
        let testCases;
        try {
          testCases = JSON.parse(row.TestCases || row.testCases || "[]");
          if (!Array.isArray(testCases) || testCases.some((t) => typeof t.input !== "string" || typeof t.expected !== "string")) throw new Error("bad shape");
        } catch {
          failures.push(`${title}: TestCases column is not valid JSON`);
          continue;
        }
        const idealTraits = String(row.IdealTraits || row.idealTraits || "").split("\n").map((t) => t.trim()).filter(Boolean);
        const timerEnabled = String(row.TimerEnabled ?? "TRUE").trim().toUpperCase() !== "FALSE";
        const timeLimitMinutes = Math.max(1, Math.round(Number(row.TimeLimitMinutes)) || 3);
        try {
          await DB.saveProblem({
            id: uid(), title, difficulty: row.Difficulty || row.difficulty || "Medium", statement,
            constraints: String(row.Constraints || row.constraints || ""), inputFormat: String(row.InputFormat || row.inputFormat || ""),
            outputFormat: String(row.OutputFormat || row.outputFormat || ""), idealTraits, testCases,
            unordered: String(row.Unordered ?? "FALSE").trim().toUpperCase() === "TRUE",
            timeLimitMinutes, timerEnabled, createdAt: Date.now(),
          });
          created++;
        } catch (createErr) {
          failures.push(`${title}: ${createErr.message}`);
        }
      }
      setImportSummary({ total: rows.length, created, failures });
      load();
    } catch (e) {
      setErr(e.message || "Could not read that file. Use the template format.");
    } finally {
      setImporting(false);
    }
  }

  function exportProblems() {
    downloadWorkbook("problems.xlsx", "Problems", PROBLEM_TEMPLATE_COLUMNS, problems.map((p) => ({
      Title: p.title, Difficulty: p.difficulty, Statement: p.statement, Constraints: p.constraints,
      InputFormat: p.inputFormat, OutputFormat: p.outputFormat, Unordered: p.unordered ? "TRUE" : "FALSE",
      TimeLimitMinutes: p.timeLimitMinutes, TimerEnabled: p.timerEnabled ? "TRUE" : "FALSE",
      IdealTraits: (p.idealTraits || []).join("\n"), TestCases: JSON.stringify(p.testCases || []),
    })));
  }

  function editProblem(p) {
    setForm(problemToFormState(p));
    setErr("");
  }

  function newProblem() {
    setForm(EMPTY_PROBLEM);
    setErr("");
  }

  async function remove(id) {
    if (!window.confirm("Remove this problem?")) return;
    await DB.deleteProblem(id);
    if (form.id === id) newProblem();
    load();
  }

  async function save() {
    setErr("");
    if (!form.title.trim() || !form.statement.trim()) { setErr("Title and statement are required."); return; }
    let testCases;
    try {
      testCases = JSON.parse(form.testCasesText || "[]");
      if (!Array.isArray(testCases) || testCases.some((t) => typeof t.input !== "string" || typeof t.expected !== "string")) {
        throw new Error("bad shape");
      }
    } catch (e) {
      setErr('Test cases must be valid JSON: [{"input":"...","expected":"..."}]');
      return;
    }
    const idealTraits = form.idealTraitsText.split("\n").map((t) => t.trim()).filter(Boolean);
    setSaving(true);
    try {
      await DB.saveProblem({
        id: form.id || uid(),
        title: form.title.trim(),
        difficulty: form.difficulty,
        statement: form.statement.trim(),
        constraints: form.constraints.trim(),
        inputFormat: form.inputFormat.trim(),
        outputFormat: form.outputFormat.trim(),
        idealTraits,
        testCases,
        unordered: form.unordered,
        timeLimitMinutes: form.timerEnabled ? Math.max(1, Math.round(form.timeLimitMinutes) || 3) : form.timeLimitMinutes,
        timerEnabled: form.timerEnabled,
        createdAt: Date.now(),
      });
      newProblem();
      load();
    } catch (e) {
      setErr(e.message || "Could not save problem.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, height: "100%", minHeight: 0 }}>
      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
          <div style={label()}>Problem Bank ({problems.length})</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleImportFile} style={{ display: "none" }} />
            <button onClick={downloadProblemTemplate} title="Download a blank .xlsx template" style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.panelAlt, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
              <FileSpreadsheet size={12} />Template
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={importing} title="Bulk import problems from .xlsx" style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.panelAlt, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: importing ? "not-allowed" : "pointer" }}>
              <Upload size={12} />{importing ? "Importing…" : "Import"}
            </button>
            <button onClick={exportProblems} title="Export problems to .xlsx" style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.panelAlt, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
              <Download size={12} />Export
            </button>
            <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.panelAlt, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
              <RefreshCw size={12} />Refresh
            </button>
          </div>
        </div>
        {importSummary && (
          <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 10, marginTop: 10, fontSize: 12 }}>
            <div style={{ color: COLORS.teal }}>Imported {importSummary.created} of {importSummary.total} row(s).</div>
            {importSummary.failures.length > 0 && (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: COLORS.rose }}>
                {importSummary.failures.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            )}
          </div>
        )}
        {loading ? (
          <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 10 }}>Loading…</div>
        ) : problems.length === 0 ? (
          <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 10 }}>No problems yet. Add one using the form.</div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {problems.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: COLORS.bg, border: `1px solid ${form.id === p.id ? COLORS.gold : COLORS.border}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                    <Pill tone={p.difficulty === "Hard" ? "rose" : p.difficulty === "Medium" ? "gold" : "teal"}>{p.difficulty}</Pill>
                    <span style={{ fontSize: 11, color: COLORS.muted }}>{p.testCases.length} test cases</span>
                    <span style={{ fontSize: 11, color: COLORS.muted }}>· {p.timerEnabled ? `${p.timeLimitMinutes}m timer` : "no timer"}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => editProblem(p)} title="Edit" style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: 6 }}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => remove(p.id)} title="Delete" style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: 6 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={label()}>{form.id ? "Edit Problem" : "New Problem"}</div>
          {form.id && (
            <button onClick={newProblem} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: COLORS.muted, cursor: "pointer", fontSize: 11.5 }}>
              <Plus size={12} />New instead
            </button>
          )}
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} placeholder="Title" />
          <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} style={inputStyle}>
            <option>Easy</option><option>Medium</option><option>Hard</option>
          </select>
          <textarea value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }} placeholder="Problem statement" />
          <input value={form.constraints} onChange={(e) => setForm({ ...form, constraints: e.target.value })} style={inputStyle} placeholder="Constraints (e.g. 1 ≤ n ≤ 100000)" />
          <input value={form.inputFormat} onChange={(e) => setForm({ ...form, inputFormat: e.target.value })} style={inputStyle} placeholder="Input format" />
          <input value={form.outputFormat} onChange={(e) => setForm({ ...form, outputFormat: e.target.value })} style={inputStyle} placeholder="Output format" />
          <textarea value={form.idealTraitsText} onChange={(e) => setForm({ ...form, idealTraitsText: e.target.value })} style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }} placeholder={"Ideal traits, one per line\ne.g. States O(n) time complexity"} />
          <textarea
            value={form.testCasesText} onChange={(e) => setForm({ ...form, testCasesText: e.target.value })}
            style={{ ...inputStyle, minHeight: 120, resize: "vertical", fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }}
            placeholder={'[\n  {"input": "5\\n1 2 3 4 5", "expected": "15"}\n]'}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: COLORS.muted, cursor: "pointer" }}>
            <input type="checkbox" checked={form.unordered} onChange={(e) => setForm({ ...form, unordered: e.target.checked })} />
            Output order doesn't matter when comparing
          </label>

          <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: COLORS.text, cursor: "pointer", marginBottom: form.timerEnabled ? 10 : 0 }}>
              <input type="checkbox" checked={form.timerEnabled} onChange={(e) => setForm({ ...form, timerEnabled: e.target.checked })} />
              Timer enabled for this problem
            </label>
            {form.timerEnabled && (
              <>
                <div style={{ ...label(), marginBottom: 6 }}>Time limit</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {TIME_PRESETS.map((m) => (
                    <button
                      key={m} type="button" onClick={() => setForm({ ...form, timeLimitMinutes: m })}
                      style={{
                        padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                        border: `1px solid ${form.timeLimitMinutes === m ? COLORS.gold : COLORS.border}`,
                        background: form.timeLimitMinutes === m ? "rgba(232,185,95,0.12)" : COLORS.bg,
                        color: form.timeLimitMinutes === m ? COLORS.gold : COLORS.text,
                      }}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
                <input
                  type="number" min={1} value={form.timeLimitMinutes}
                  onChange={(e) => setForm({ ...form, timeLimitMinutes: e.target.value === "" ? "" : Number(e.target.value) })}
                  style={inputStyle} placeholder="Custom duration (minutes)"
                />
              </>
            )}
          </div>
        </div>
        {err && <div style={{ color: COLORS.rose, fontSize: 12.5, marginTop: 12, display: "flex", gap: 6 }}><AlertTriangle size={13} style={{ marginTop: 1 }} />{err}</div>}
        <button onClick={save} disabled={saving} style={{ marginTop: 16, width: "100%", background: COLORS.gold, color: "#1A1300", border: "none", borderRadius: 8, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Saving…" : form.id ? "Save changes" : "Add problem"}
        </button>
      </div>
    </div>
  );
}

function AdminDashboard({ onLogout }) {
  const [tab, setTab] = useState("candidates");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Lock size={15} color={COLORS.gold} /><span style={{ fontSize: 16, fontWeight: 700 }}>Admin Dashboard</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <TabButton active={tab === "candidates"} onClick={() => setTab("candidates")} icon={<Users size={13} />}>Candidates</TabButton>
            <TabButton active={tab === "problems"} onClick={() => setTab("problems")} icon={<ListChecks size={13} />}>Problems</TabButton>
            <TabButton active={tab === "students"} onClick={() => setTab("students")} icon={<GraduationCap size={13} />}>Students</TabButton>
            <TabButton active={tab === "assignments"} onClick={() => setTab("assignments")} icon={<CalendarClock size={13} />}>Assignments</TabButton>
          </div>
        </div>
        <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.panelAlt, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, cursor: "pointer" }}>
          <LogOut size={13} />Log out
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === "candidates" && <CandidatesTab />}
        {tab === "problems" && <ProblemsTab />}
        {tab === "students" && <AdminStudents />}
        {tab === "assignments" && <AdminAssignments />}
      </div>
    </div>
  );
}

export function AdminPanel() {
  const [authed, setAuthed] = useState(false);
  return authed ? <AdminDashboard onLogout={() => setAuthed(false)} /> : <AdminLogin onAuthed={() => setAuthed(true)} />;
}
