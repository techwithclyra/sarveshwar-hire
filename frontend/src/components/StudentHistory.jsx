import React, { useState } from "react";
import { ChevronDown, ChevronRight, Check, ThumbsUp, ThumbsDown, Lightbulb } from "lucide-react";
import { COLORS } from "../config/colors.js";
import { gradeTone, fmtDate } from "../lib/util.js";
import { formatClock } from "../lib/timer.js";
import { Pill, label } from "./ui.jsx";

export function StudentHistory({ candidate }) {
  const [expandedIdx, setExpandedIdx] = useState(null);
  const attempts = [...(candidate.attempts || [])].sort((a, b) => (b.submittedAt || b.at) - (a.submittedAt || a.at));

  if (attempts.length === 0) {
    return <div style={{ color: COLORS.muted, padding: 24 }}>No submissions yet — your attempt history will show up here once you submit a prompt.</div>;
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, maxWidth: 900, margin: "0 auto", width: "100%" }}>
      <div style={label()}>Submission History ({attempts.length})</div>
      {attempts.map((a, i) => {
        const expanded = expandedIdx === i;
        return (
          <div key={i} style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setExpandedIdx(expanded ? null : i)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                {expanded ? <ChevronDown size={14} color={COLORS.muted} /> : <ChevronRight size={14} color={COLORS.muted} />}
                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title || a.problemId}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 11.5, color: COLORS.muted }}>{fmtDate(a.submittedAt || a.at)}</span>
                <Pill tone={a.submissionType === "auto" ? "rose" : a.submissionType === "skipped" ? "gold" : "teal"}>{a.submissionType === "auto" ? "Auto (timeout)" : a.submissionType === "skipped" ? "Skipped" : "Manual"}</Pill>
                <Pill tone={gradeTone(a.grade)}>Grade {a.grade}</Pill>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{a.overall}</div>
              </div>
            </div>
            {expanded && (
              <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                  <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 10.5, color: COLORS.muted }}>Prompt Score</div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{a.promptScore}</div>
                  </div>
                  <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 10.5, color: COLORS.muted }}>Coding Score</div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{a.codingScore}</div>
                  </div>
                  <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 10.5, color: COLORS.muted }}>Tests Passed</div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{a.passed}/{a.total}</div>
                  </div>
                  <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 10.5, color: COLORS.muted }}>Time Taken</div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>{a.timeTakenSec != null ? formatClock(a.timeTakenSec) : "—"}</div>
                  </div>
                </div>

                {a.feedback && <div style={{ fontSize: 12.5, color: COLORS.muted, lineHeight: 1.5 }}>{a.feedback}</div>}

                {a.prompt && (
                  <div>
                    <div style={label()}>Your Prompt</div>
                    <pre style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12, fontSize: 12, color: COLORS.text, whiteSpace: "pre-wrap", fontFamily: "'JetBrains Mono', monospace", marginTop: 6 }}>{a.prompt}</pre>
                  </div>
                )}

                {a.strengths?.length > 0 && (
                  <div>
                    <div style={label(COLORS.teal)}>Strengths</div>
                    <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                      {a.strengths.map((s, si) => (
                        <div key={si} style={{ display: "flex", gap: 6, fontSize: 12, color: COLORS.text }}><ThumbsUp size={12} color={COLORS.teal} style={{ marginTop: 2, flexShrink: 0 }} />{s}</div>
                      ))}
                    </div>
                  </div>
                )}
                {a.weaknesses?.length > 0 && (
                  <div>
                    <div style={label(COLORS.rose)}>Weaknesses</div>
                    <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                      {a.weaknesses.map((w, wi) => (
                        <div key={wi} style={{ display: "flex", gap: 6, fontSize: 12, color: COLORS.text }}><ThumbsDown size={12} color={COLORS.rose} style={{ marginTop: 2, flexShrink: 0 }} />{w}</div>
                      ))}
                    </div>
                  </div>
                )}
                {a.suggestions?.length > 0 && (
                  <div>
                    <div style={label(COLORS.gold)}>Suggestions</div>
                    <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                      {a.suggestions.map((s, si) => (
                        <div key={si} style={{ display: "flex", gap: 6, fontSize: 12, color: COLORS.text }}><Lightbulb size={12} color={COLORS.gold} style={{ marginTop: 2, flexShrink: 0 }} />{s}</div>
                      ))}
                    </div>
                  </div>
                )}

                {a.code && (
                  <div>
                    <div style={label()}>Generated Solution</div>
                    <pre style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12, fontSize: 11, color: COLORS.muted, overflowX: "auto", fontFamily: "'JetBrains Mono', monospace", marginTop: 6 }}>{a.code}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
