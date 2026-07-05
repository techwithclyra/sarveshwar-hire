import React, { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, Pencil, Trash2, Plus, AlertTriangle, KeyRound, Upload, Download, FileSpreadsheet } from "lucide-react";
import { COLORS } from "../config/colors.js";
import { StudentsAPI } from "../lib/studentsApi.js";
import { parseWorkbookRows, downloadWorkbook } from "../lib/excel.js";
import { Pill, label, inputStyle } from "./ui.jsx";

const STUDENT_TEMPLATE_COLUMNS = [
  { header: "Name", key: "Name" }, { header: "Email", key: "Email" }, { header: "College", key: "College" },
  { header: "Department", key: "Department" }, { header: "Batch", key: "Batch" },
  { header: "Username", key: "Username" }, { header: "Password", key: "Password" },
];

function downloadStudentTemplate() {
  downloadWorkbook("students-template.xlsx", "Students", STUDENT_TEMPLATE_COLUMNS, [
    { Name: "Priya Krishnan", Email: "priya@example.com", College: "SNU Chennai", Department: "Computer Science", Batch: "2026-CSE-A", Username: "priya.k", Password: "ChangeMe123" },
  ]);
}

const EMPTY_STUDENT = { id: null, name: "", email: "", college: "", department: "", batch: "", username: "", password: "", active: true };

function studentToFormState(s) {
  return { id: s.id, name: s.name, email: s.email, college: s.college, department: s.department, batch: s.batch || "", username: s.username, password: "", active: s.active !== false };
}

export function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [form, setForm] = useState(EMPTY_STUDENT);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr("");
    try { setStudents(await StudentsAPI.list()); }
    catch (e) { setLoadErr(e.message || "Could not load students"); }
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
        const name = String(row.Name || row.name || "").trim();
        const email = String(row.Email || row.email || "").trim();
        const college = String(row.College || row.college || "").trim();
        const department = String(row.Department || row.department || "").trim();
        const batch = String(row.Batch || row.batch || "").trim();
        const username = String(row.Username || row.username || "").trim();
        const password = String(row.Password || row.password || "");
        if (!name || !email || !college || !department || !username || !password) {
          failures.push(`${username || email || name || "(unnamed row)"}: missing a required field`);
          continue;
        }
        try {
          await StudentsAPI.create({ name, email, college, department, batch, username, password });
          created++;
        } catch (createErr) {
          failures.push(`${username}: ${createErr.message}`);
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

  function exportStudents() {
    downloadWorkbook("students.xlsx", "Students", [...STUDENT_TEMPLATE_COLUMNS.slice(0, -1), { header: "Active", key: "Active" }],
      students.map((s) => ({ Name: s.name, Email: s.email, College: s.college, Department: s.department, Batch: s.batch, Username: s.username, Active: s.active ? "TRUE" : "FALSE" })));
  }

  function editStudent(s) {
    setForm(studentToFormState(s));
    setErr("");
  }
  function newStudent() {
    setForm(EMPTY_STUDENT);
    setErr("");
  }

  async function remove(id) {
    if (!window.confirm("Remove this student? Their login will stop working, but past submissions stay in Candidates.")) return;
    try { await StudentsAPI.remove(id); if (form.id === id) newStudent(); load(); }
    catch (e) { setErr(e.message || "Could not remove student"); }
  }

  async function save() {
    setErr("");
    if (!form.name.trim() || !form.email.trim() || !form.college.trim() || !form.department.trim() || !form.username.trim()) {
      setErr("Name, email, college, department, and username are required.");
      return;
    }
    if (!form.id && !form.password) { setErr("A password is required for a new student."); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), email: form.email.trim(), college: form.college.trim(),
        department: form.department.trim(), batch: form.batch.trim(), username: form.username.trim(),
        active: form.active,
      };
      if (form.password) payload.password = form.password;
      if (form.id) await StudentsAPI.update(form.id, payload);
      else await StudentsAPI.create(payload);
      newStudent();
      load();
    } catch (e) {
      setErr(e.message || "Could not save student.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, height: "100%", minHeight: 0 }}>
      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
          <div style={label()}>Students ({students.length})</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleImportFile} style={{ display: "none" }} />
            <button onClick={downloadStudentTemplate} title="Download a blank .xlsx template" style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.panelAlt, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
              <FileSpreadsheet size={12} />Template
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={importing} title="Bulk import students from .xlsx" style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.panelAlt, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: importing ? "not-allowed" : "pointer" }}>
              <Upload size={12} />{importing ? "Importing…" : "Import"}
            </button>
            <button onClick={exportStudents} title="Export students to .xlsx" style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.panelAlt, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
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
        {loadErr && <div style={{ color: COLORS.rose, fontSize: 12.5, marginTop: 10, display: "flex", gap: 6 }}><AlertTriangle size={13} style={{ marginTop: 1 }} />{loadErr}</div>}
        {loading ? (
          <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 10 }}>Loading…</div>
        ) : students.length === 0 ? (
          <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 10 }}>No students yet. Add one using the form.</div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {students.map((s) => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: COLORS.bg, border: `1px solid ${form.id === s.id ? COLORS.gold : COLORS.border}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                    {!s.active && <Pill tone="rose">Disabled</Pill>}
                  </div>
                  <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 4 }}>
                    @{s.username} · {s.email} · {s.department} · {s.college}{s.batch ? ` · ${s.batch}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => editStudent(s)} title="Edit" style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: 6 }}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => remove(s.id)} title="Delete" style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", padding: 6 }}>
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
          <div style={label()}>{form.id ? "Edit Student" : "New Student"}</div>
          {form.id && (
            <button onClick={newStudent} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: COLORS.muted, cursor: "pointer", fontSize: 11.5 }}>
              <Plus size={12} />New instead
            </button>
          )}
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} placeholder="Full name" />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} placeholder="Email" />
          <input value={form.college} onChange={(e) => setForm({ ...form, college: e.target.value })} style={inputStyle} placeholder="College" />
          <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} style={inputStyle} placeholder="Department" />
          <input value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} style={inputStyle} placeholder="Batch (optional, e.g. 2026-CSE-A)" />
          <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} style={inputStyle} placeholder="Username" autoComplete="off" />
          <div>
            <input
              type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              style={inputStyle} placeholder={form.id ? "New password (leave blank to keep current)" : "Password"} autoComplete="new-password"
            />
            {form.id && <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: COLORS.muted, marginTop: 4 }}><KeyRound size={11} />Only fill this in to reset the student's password.</div>}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: COLORS.muted, cursor: "pointer" }}>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Account active (unchecked blocks login)
          </label>
        </div>
        {err && <div style={{ color: COLORS.rose, fontSize: 12.5, marginTop: 12, display: "flex", gap: 6 }}><AlertTriangle size={13} style={{ marginTop: 1 }} />{err}</div>}
        <button onClick={save} disabled={saving} style={{ marginTop: 16, width: "100%", background: COLORS.gold, color: "#1A1300", border: "none", borderRadius: 8, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Saving…" : form.id ? "Save changes" : "Add student"}
        </button>
      </div>
    </div>
  );
}
