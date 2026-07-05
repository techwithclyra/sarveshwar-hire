import React from "react";
import { Timer } from "lucide-react";
import { COLORS } from "../config/colors.js";
import { formatClock } from "../lib/timer.js";

export function CountdownTimer({ remainingSec, totalSec }) {
  const low = totalSec > 0 && remainingSec / totalSec <= 0.2;
  const color = low ? COLORS.rose : COLORS.gold;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, background: COLORS.panel,
      border: `1px solid ${low ? COLORS.rose : COLORS.border}`, borderRadius: 10,
      padding: "10px 16px", marginBottom: 16, flexShrink: 0,
    }}>
      <Timer size={16} color={color} />
      <span style={{ fontSize: 13, color: COLORS.muted }}>Time Remaining</span>
      <span style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace", marginLeft: "auto", letterSpacing: 1 }}>
        {formatClock(remainingSec)}
      </span>
    </div>
  );
}
