import React, { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Pencil, Trash2, Plus, AlertTriangle, Shuffle, ChevronDown, ChevronRight } from "lucide-react";
import { COLORS } from "../config/colors.js";
import { DB } from "../lib/db.js";
import { StudentsAPI } from "../lib/studentsApi.js";
import { formatClock } from "../lib/timer.js";
import {
  isAssignmentOpen, matchingStudents, resolveAssignmentProblems, randomProblemIds, studentAssignmentStatus,
} from "../lib/assignments.js";
import { Pill, label, inputStyle } from "./ui.jsx";

const TIME_PRESETS = [3, 5, 10, 15, 30, 60];
const DIFFICULTIES = ["Easy", "Medium", "Hard", "Mixed"];

const EMPTY_ASSIGNMENT = {
  id: null, title: "",
  targetType: "group", targetStudentIds: [], targetCollege: "", targetDepartment: "", targetBatch: "",
  problemMode: "difficulty", problemIds: [], difficultyFilter: "Mixed",
  timeLimitMinutes: 3, startAt: null, endAt: null, maxAttempts: 1, allowRevisit: true, active: true,
};

function toLocalInput(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

const STATUS_TONE = { not_started: "muted", in_progress: "gold", completed: "teal" };
const STATUS_LABEL = { not_started: "Not Started", in_progress: "In Progress", completed: "Completed" };

export function AdminAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [students, setStudents] = useState([]);
  const [problems, setProblems] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm] = useState(EMPTY_ASSIGNMENT);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [randomPool, setRandomPool] = useState("Mixed");
  const [randomCount, setRandomCount] = useState(3);

  const load = useCallback(async () => {
    setLoadErr("");
    try {
      const [a, s, p, c] = await Promise.all([DB.listAssignments(), StudentsAPI.list(), DB.listProblems(), DB.allCandidates()]);
      setAssignments(a); setStudents(s); setProblems(p); setCandidates(c);
    } catch (e) {
      setLoadErr(e.message || "Could not load assignment data");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  // Cheap stand-in for real-time monitoring — no websocket/push layer here,
  // so the admin view polls Supabase every 10s while this tab is open.
  useEffect(() => {
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const candidatesById = useMemo(() => Object.fromEntries(candidates.map((c) => [c.id, c])), [candidates]);
  const collegeOptions = useMemo(() => [...new Set(students.map((s) => s.college).filter(Boolean))], [students]);
  const deptOptions = useMemo(() => [...new Set(students.map((s) => s.department).filter(Boolean))], [students]);
  const batchOptions = useMemo(() => [...new Set(students.map((s) => s.batch).filter(Boolean))], [students]);

  function editAssignment(a) {
    setForm({ ...a, startAt: a.startAt, endAt: a.endAt });
    setErr("");
  }
  function newAssignment() {
    setForm(EMPTY_ASSIGNMENT);
    setErr("");
  }

  async function remove(id) {
    if (!window.confirm("Delete this assignment? Students matched by it will lose access to the problems it granted.")) return;
    await DB.deleteAssignment(id);
    if (form.id === id) newAssignment();
    load();
  }

  function toggleStudentTarget(id) {
    const set = new Set(form.targetStudentIds);
    if (set.has(id)) set.delete(id); else set.add(id);
    setForm({ ...form, targetStudentIds: [...set] });
  }
  function toggleProblemTarget(id) {
    const set = new Set(form.problemIds);
    if (set.has(id)) set.delete(id); else set.add(id);
    setForm({ ...form, problemIds: [...set] });
  }
  function randomize() {
    const pool = randomPool === "Mixed" ? problems : problems.filter((p) => p.difficulty === randomPool);
    setForm({ ...form, problemMode: "specific", problemIds: randomProblemIds(pool, Math.min(randomCount, pool.length)) });
  }

  async function save() {
    setErr("");
    if (!form.title.trim()) { setErr("Give this assignment a title."); return; }
    if (form.targetType === "individual" && form.targetStudentIds.length === 0) { setErr("Select at least one student."); return; }
    if (form.problemMode === "specific" && form.problemIds.length === 0) { setErr("Select at least one problem, or use Randomize."); return; }
    setSaving(true);
    try {
      await DB.saveAssignment({ ...form, id: form.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), createdAt: form.createdAt || Date.now() });
      newAssignment();
      load();
    } catch (e) {
      setErr(e.message || "Could not save assignment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 16, height: "100%", minHeight: 0 }}>
      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={label()}>Assignments ({assignments.length})</div>
          <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.panelAlt, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
            <RefreshCw size={12} />Refresh
          </button>
        </div>
        {loadErr && <div style={{ color: COLORS.rose, fontSize: 12.5, marginTop: 10, display: "flex", gap: 6 }}><AlertTriangle size={13} style={{ marginTop: 1 }} />{loadErr}</div>}
        {loading ? (
          <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 10 }}>Loading…</div>
        ) : assignments.length === 0 ? (
          <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 10 }}>No assignments yet. Create one using the form.</div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {assignments.map((a) => {
              const resolvedProblems = resolveAssignmentProblems(a, problems);
              const matched = matchingStudents(a, students);
              const statuses = matched.map((s) => studentAssignmentStatus(a, resolvedProblems, candidatesById[s.id]));
              const completedCount = statuses.filter((st) => st.status === "completed").length;
              const pct = matched.length ? Math.round((completedCount / matched.length) * 100) : 0;
              const expanded = expandedId === a.id;
              return (
                <div key={a.id} style={{ background: COLORS.bg, border: `1px solid ${form.id === a.id ? COLORS.gold : COLORS.border}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setExpandedId(expanded ? null : a.id)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      {expanded ? <ChevronDown size={14} color={COLORS.muted} /> : <ChevronRight size={14} color={COLORS.muted} />}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</div>
                        <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                          {a.targetType === "individual" ? `${a.targetStudentIds.length} student(s)` : `${[a.targetCollege, a.targetDepartment, a.targetBatch].filter(Boolean).join(" · ") || "All students"}`}
                          {" · "}{resolvedProblems.length} problem(s) · {a.timeLimitMinutes}m · max {a.maxAttempts} attempt(s)
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <Pill tone={isAssignmentOpen(a) ? "teal" : "muted"}>{isAssignmentOpen(a) ? "Open" : "Closed"}</Pill>
                      <span style={{ fontSize: 11, color: COLORS.muted }}>{completedCount}/{matched.length} ({pct}%)</span>
                      <button onClick={(e) => { e.stopPropagation(); editAssignment(a); }} title="Edit" style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: 4 }}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); remove(a.id); }} title="Delete" style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: 4 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {expanded && (
                    matched.length === 0 ? (
                      <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 10 }}>No students currently match this assignment's target.</div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, marginTop: 10 }}>
                        <thead>
                          <tr style={{ textAlign: "left", color: COLORS.muted, textTransform: "uppercase", fontSize: 10 }}>
                            <th style={{ padding: "4px 6px" }}>Student</th>
                            <th style={{ padding: "4px 6px" }}>Status</th>
                            <th style={{ padding: "4px 6px" }}>Progress</th>
                            <th style={{ padding: "4px 6px" }}>Remaining</th>
                            <th style={{ padding: "4px 6px" }}>Best Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matched.map((s) => {
                            const st = studentAssignmentStatus(a, resolvedProblems, candidatesById[s.id]);
                            const scores = (candidatesById[s.id]?.attempts || []).filter((att) => resolvedProblems.some((p) => p.id === att.problemId)).map((att) => att.overall);
                            const best = scores.length ? Math.max(...scores) : null;
                            return (
                              <tr key={s.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                                <td style={{ padding: "6px" }}>{s.name}</td>
                                <td style={{ padding: "6px" }}><Pill tone={STATUS_TONE[st.status]}>{STATUS_LABEL[st.status]}</Pill></td>
                                <td style={{ padding: "6px", color: COLORS.muted }}>{st.completed}/{st.total}</td>
                                <td style={{ padding: "6px", color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>{st.remainingSec != null ? formatClock(st.remainingSec) : "—"}</td>
                                <td style={{ padding: "6px" }}>{best === null ? <span style={{ color: COLORS.muted }}>—</span> : best}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={label()}>{form.id ? "Edit Assignment" : "New Assignment"}</div>
          {form.id && (
            <button onClick={newAssignment} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: COLORS.muted, cursor: "pointer", fontSize: 11.5 }}>
              <Plus size={12} />New instead
            </button>
          )}
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} placeholder="Title (e.g. Midterm — CSE Batch 2026)" />

          <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10 }}>
            <div style={{ ...label(), marginBottom: 6 }}>Who is this assigned to?</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {["group", "individual"].map((t) => (
                <button key={t} type="button" onClick={() => setForm({ ...form, targetType: t })}
                  style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", textTransform: "capitalize", border: `1px solid ${form.targetType === t ? COLORS.gold : COLORS.border}`, background: form.targetType === t ? "rgba(232,185,95,0.12)" : COLORS.bg, color: form.targetType === t ? COLORS.gold : COLORS.text }}>
                  {t}
                </button>
              ))}
            </div>
            {form.targetType === "group" ? (
              <div style={{ display: "grid", gap: 8 }}>
                <input list="college-opts" value={form.targetCollege} onChange={(e) => setForm({ ...form, targetCollege: e.target.value })} style={inputStyle} placeholder="College (blank = any)" />
                <datalist id="college-opts">{collegeOptions.map((c) => <option key={c} value={c} />)}</datalist>
                <input list="dept-opts" value={form.targetDepartment} onChange={(e) => setForm({ ...form, targetDepartment: e.target.value })} style={inputStyle} placeholder="Department (blank = any)" />
                <datalist id="dept-opts">{deptOptions.map((d) => <option key={d} value={d} />)}</datalist>
                <input list="batch-opts" value={form.targetBatch} onChange={(e) => setForm({ ...form, targetBatch: e.target.value })} style={inputStyle} placeholder="Batch (blank = any)" />
                <datalist id="batch-opts">{batchOptions.map((b) => <option key={b} value={b} />)}</datalist>
              </div>
            ) : (
              <div style={{ maxHeight: 140, overflowY: "auto", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 8 }}>
                {students.length === 0 ? (
                  <div style={{ color: COLORS.muted, fontSize: 12 }}>No students yet — add some in the Students tab first.</div>
                ) : students.map((s) => (
                  <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "4px 0", cursor: "pointer" }}>
                    <input type="checkbox" checked={form.targetStudentIds.includes(s.id)} onChange={() => toggleStudentTarget(s.id)} />
                    {s.name} <span style={{ color: COLORS.muted }}>· {s.department}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10 }}>
            <div style={{ ...label(), marginBottom: 6 }}>Which problem(s)?</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {["difficulty", "specific"].map((m) => (
                <button key={m} type="button" onClick={() => setForm({ ...form, problemMode: m })}
                  style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", textTransform: "capitalize", border: `1px solid ${form.problemMode === m ? COLORS.gold : COLORS.border}`, background: form.problemMode === m ? "rgba(232,185,95,0.12)" : COLORS.bg, color: form.problemMode === m ? COLORS.gold : COLORS.text }}>
                  {m === "difficulty" ? "By difficulty" : "Specific"}
                </button>
              ))}
            </div>
            {form.problemMode === "difficulty" ? (
              <select value={form.difficultyFilter} onChange={(e) => setForm({ ...form, difficultyFilter: e.target.value })} style={inputStyle}>
                {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
              </select>
            ) : (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <select value={randomPool} onChange={(e) => setRandomPool(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                    {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
                  </select>
                  <input type="number" min={1} value={randomCount} onChange={(e) => setRandomCount(Number(e.target.value) || 1)} style={{ ...inputStyle, width: 70 }} />
                  <button type="button" onClick={randomize} style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.panelAlt, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "0 12px", fontSize: 12, cursor: "pointer" }}>
                    <Shuffle size={13} />Randomize
                  </button>
                </div>
                <div style={{ maxHeight: 140, overflowY: "auto", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 8 }}>
                  {problems.length === 0 ? (
                    <div style={{ color: COLORS.muted, fontSize: 12 }}>No problems yet — add some in the Problems tab first.</div>
                  ) : problems.map((p) => (
                    <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "4px 0", cursor: "pointer" }}>
                      <input type="checkbox" checked={form.problemIds.includes(p.id)} onChange={() => toggleProblemTarget(p.id)} />
                      {p.title} <Pill tone={p.difficulty === "Hard" ? "rose" : p.difficulty === "Medium" ? "gold" : "teal"}>{p.difficulty}</Pill>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10 }}>
            <div style={{ ...label(), marginBottom: 6 }}>Time limit (per problem)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {TIME_PRESETS.map((m) => (
                <button key={m} type="button" onClick={() => setForm({ ...form, timeLimitMinutes: m })}
                  style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: `1px solid ${form.timeLimitMinutes === m ? COLORS.gold : COLORS.border}`, background: form.timeLimitMinutes === m ? "rgba(232,185,95,0.12)" : COLORS.bg, color: form.timeLimitMinutes === m ? COLORS.gold : COLORS.text }}>
                  {m}m
                </button>
              ))}
            </div>
            <input type="number" min={1} value={form.timeLimitMinutes} onChange={(e) => setForm({ ...form, timeLimitMinutes: e.target.value === "" ? "" : Number(e.target.value) })} style={inputStyle} placeholder="Custom duration (minutes)" />
          </div>

          <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10, display: "grid", gap: 8 }}>
            <div style={label()}>Start / End (optional)</div>
            <input type="datetime-local" value={toLocalInput(form.startAt)} onChange={(e) => setForm({ ...form, startAt: fromLocalInput(e.target.value) })} style={inputStyle} />
            <input type="datetime-local" value={toLocalInput(form.endAt)} onChange={(e) => setForm({ ...form, endAt: fromLocalInput(e.target.value) })} style={inputStyle} />
          </div>

          <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10, display: "grid", gap: 8 }}>
            <div>
              <div style={{ ...label(), marginBottom: 6 }}>Maximum attempts</div>
              <input type="number" min={1} value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) || 1 })} style={inputStyle} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: COLORS.muted, cursor: "pointer" }}>
              <input type="checkbox" checked={form.allowRevisit} onChange={(e) => setForm({ ...form, allowRevisit: e.target.checked })} />
              Students can revisit previous submissions
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: COLORS.text, cursor: "pointer" }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Assignment active
            </label>
          </div>
        </div>
        {err && <div style={{ color: COLORS.rose, fontSize: 12.5, marginTop: 12, display: "flex", gap: 6 }}><AlertTriangle size={13} style={{ marginTop: 1 }} />{err}</div>}
        <button onClick={save} disabled={saving} style={{ marginTop: 16, width: "100%", background: COLORS.gold, color: "#1A1300", border: "none", borderRadius: 8, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Saving…" : form.id ? "Save changes" : "Create assignment"}
        </button>
      </div>
    </div>
  );
}
