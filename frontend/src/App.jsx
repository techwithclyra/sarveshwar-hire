import React, { useState, Suspense, lazy } from "react";
import { Terminal, Lock, ArrowLeft, LogOut, Loader2, History } from "lucide-react";
import { COLORS, FONT_IMPORT } from "./config/colors.js";
import { AuthGate } from "./components/AuthGate.jsx";
import { CandidateWorkspace } from "./components/CandidateWorkspace.jsx";
import { StudentHistory } from "./components/StudentHistory.jsx";
import { supabase } from "./lib/supabaseClient.js";

// Lazy-loaded: the Admin Panel pulls in exceljs for bulk import/export,
// which roughly triples the JS bundle. Splitting it out means students
// logging in to solve a problem never download that weight.
const AdminPanel = lazy(() => import("./components/AdminPanel.jsx").then((m) => ({ default: m.AdminPanel })));

export default function App() {
  const [view, setView] = useState("intake"); // intake | workspace | admin
  const [candidate, setCandidate] = useState(null);

  return (
    <div style={{ background: COLORS.bg, color: COLORS.text, height: "100vh", fontFamily: "'Space Grotesk', sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{FONT_IMPORT}{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        input::placeholder, textarea::placeholder { color: ${COLORS.muted}; }
        .ph-spin { animation: ph-spin 1s linear infinite; }
        @keyframes ph-spin { to { transform: rotate(360deg); } }
        @media (max-width: 900px) { .ph-grid { grid-template-columns: 1fr !important; } }
      `}</style>

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Terminal size={18} color={COLORS.teal} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Sarveshwar Hire</span>
          {(view === "workspace" || view === "history") && candidate && <span style={{ color: COLORS.muted, fontSize: 13, marginLeft: 10 }}>· {candidate.name}</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {view === "admin" ? (
            <button onClick={() => setView(candidate ? "workspace" : "intake")} style={navBtnStyle}>
              <ArrowLeft size={13} />Back
            </button>
          ) : (
            <>
              {candidate && (view === "workspace" || view === "history") && (
                <button onClick={() => setView(view === "history" ? "workspace" : "history")} style={navBtnStyle}>
                  <History size={13} />{view === "history" ? "Back to Problem" : "History"}
                </button>
              )}
              {(view === "workspace" || view === "history") && (
                <button onClick={() => { supabase?.auth.signOut(); setCandidate(null); setView("intake"); }} style={navBtnStyle}>
                  <LogOut size={13} />Log out
                </button>
              )}
              <button onClick={() => setView("admin")} style={navBtnStyle}>
                <Lock size={13} />Admin
              </button>
            </>
          )}
        </div>
      </header>

      <main style={{ flex: 1, padding: 24, minHeight: 0, overflow: "hidden" }}>
        {view === "admin" && (
          <Suspense fallback={<div style={{ color: COLORS.muted, padding: 24, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={14} className="ph-spin" />Loading admin panel…</div>}>
            <AdminPanel />
          </Suspense>
        )}
        {view === "intake" && <AuthGate onStart={(c) => { setCandidate(c); setView("workspace"); }} />}
        {view === "workspace" && candidate && <CandidateWorkspace candidate={candidate} setCandidate={setCandidate} />}
        {view === "history" && candidate && <StudentHistory candidate={candidate} />}
      </main>
    </div>
  );
}

const navBtnStyle = {
  display: "flex", alignItems: "center", gap: 6, background: COLORS.panelAlt, color: COLORS.text,
  border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, cursor: "pointer",
};
