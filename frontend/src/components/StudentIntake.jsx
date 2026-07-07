import React, { useState } from "react";
import { UserPlus, AlertTriangle } from "lucide-react";
import { COLORS } from "../config/colors.js";
import { DB } from "../lib/db.js";
import { inputStyle } from "./ui.jsx";

// A real, properly formatted email address — not exhaustive RFC 5322, but
// catches the "not an email at all" case without being pedantic.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// No password, no admin-provisioned account — a student is identified by
// email alone. Returning with the same email restores their existing
// candidate record (and attempt history); a new email creates one.
export function StudentIntake({ onStart }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [college, setCollege] = useState("");
  const [department, setDepartment] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function begin() {
    if (!name.trim() || !email.trim() || !college.trim() || !department.trim()) {
      setErr("Please fill in all four fields.");
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setErr("Enter a valid email address (e.g. name@example.com).");
      return;
    }
    setErr(""); setBusy(true);
    try {
      const id = email.trim().toLowerCase();
      const profile = { id, name: name.trim(), email: id, college: college.trim(), department: department.trim(), batch: "" };
      const existing = await DB.getCandidate(id);
      const candidate = {
        id, name: profile.name, dept: profile.department, college: profile.college,
        createdAt: existing?.createdAt || Date.now(), attempts: existing?.attempts || [], inProgress: existing?.inProgress || [],
      };
      await DB.saveCandidate(candidate);
      onStart({ ...candidate, student: profile });
    } catch (e) {
      setErr(e.message || "Could not start. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 420, maxWidth: "100%", background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <UserPlus size={16} color={COLORS.gold} /><span style={{ fontSize: 17, fontWeight: 700 }}>Student Details</span>
        </div>
        <p style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.5, marginTop: 0, marginBottom: 18 }}>
          Enter your details to begin. Returning with the same email restores your previous progress.
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 5 }}>Full name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Priya Krishnan" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 5 }}>Email</div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="e.g. priya@example.com" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 5 }}>College</div>
            <input value={college} onChange={(e) => setCollege(e.target.value)} style={inputStyle} placeholder="e.g. SNU Chennai" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 5 }}>Department</div>
            <input value={department} onChange={(e) => setDepartment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && begin()} style={inputStyle} placeholder="e.g. Computer Science" />
          </div>
        </div>
        {err && <div style={{ color: COLORS.rose, fontSize: 12.5, marginTop: 12, display: "flex", gap: 6 }}><AlertTriangle size={13} style={{ marginTop: 1 }} />{err}</div>}
        <button
          onClick={begin} disabled={busy}
          style={{ marginTop: 18, width: "100%", background: COLORS.gold, color: "#1A1300", border: "none", borderRadius: 8, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" }}
        >
          {busy ? "Starting…" : "Start Assessment"}
        </button>
      </div>
    </div>
  );
}
