import React, { useState } from "react";
import { KeyRound, Check, ChevronDown, ChevronUp } from "lucide-react";
import { COLORS } from "../config/colors.js";
import { getOpenRouterKey, setOpenRouterKey } from "../lib/openrouter.js";
import { inputStyle } from "./ui.jsx";

// Lets a logged-in student add their own OpenRouter API key so evaluation
// runs against their account instead of (or in addition to) any server-wide
// key. Collapses to a slim "connected" strip once a key is saved.
export function OpenRouterBanner({ candidate }) {
  const [key, setKey] = useState(() => getOpenRouterKey(candidate?.id));
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!candidate) return null;

  function save() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setOpenRouterKey(candidate.id, trimmed);
    setKey(trimmed);
    setDraft("");
    setExpanded(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function remove() {
    setOpenRouterKey(candidate.id, "");
    setKey("");
    setExpanded(true);
  }

  return (
    <div style={{ background: COLORS.panelAlt, borderBottom: `1px solid ${COLORS.border}`, padding: "10px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: key ? COLORS.teal : COLORS.gold }}>
          <KeyRound size={14} />
          {key ? (
            <span>OpenRouter API key connected {saved && <Check size={12} style={{ verticalAlign: "middle", marginLeft: 4 }} />}</span>
          ) : (
            <span>Add your OpenRouter API key to enable AI evaluation of your prompts</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {key && !expanded && (
            <button onClick={remove} style={linkBtnStyle}>Remove</button>
          )}
          <button onClick={() => setExpanded((e) => !e)} style={linkBtnStyle}>
            {key ? "Update key" : "Add key"}
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder="sk-or-v1-..."
            style={{ ...inputStyle, maxWidth: 340 }}
            autoFocus
          />
          <button onClick={save} style={saveBtnStyle}>Save</button>
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: COLORS.muted }}>
            Get a free key at openrouter.ai/keys
          </a>
        </div>
      )}
    </div>
  );
}

const linkBtnStyle = {
  display: "flex", alignItems: "center", gap: 4, background: "transparent", color: COLORS.text,
  border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer",
};

const saveBtnStyle = {
  background: COLORS.teal, color: "#0F1117", border: "none", borderRadius: 8,
  padding: "10px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
};
