import { COLORS } from "../config/colors.js";

export function Pill({ children, tone = "muted" }) {
  const map = {
    muted: { bg: "#1D212C", fg: COLORS.muted },
    teal: { bg: "rgba(62,217,196,0.12)", fg: COLORS.teal },
    gold: { bg: "rgba(232,185,95,0.12)", fg: COLORS.gold },
    rose: { bg: "rgba(232,96,122,0.12)", fg: COLORS.rose },
  };
  const t = map[tone];
  return (
    <span style={{ background: t.bg, color: t.fg, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, letterSpacing: 0.3, textTransform: "uppercase" }}>
      {children}
    </span>
  );
}

export function ScoreRing({ value, size = 92 }) {
  const stroke = 8, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const offset = c - (Math.min(value, 100) / 100) * c;
  const color = value >= 80 ? COLORS.teal : value >= 60 ? COLORS.gold : COLORS.rose;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={COLORS.border} strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.4,0,.2,1)" }}
      />
      <text
        x="50%" y="50%" fill={COLORS.text} fontSize={20} fontWeight={700} textAnchor="middle" dominantBaseline="middle"
        transform={`rotate(90 ${size / 2} ${size / 2})`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {Math.round(value)}
      </text>
    </svg>
  );
}

export function label(color) {
  return { fontSize: 11, color: color || COLORS.muted, letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 600, marginBottom: color ? 0 : 10, display: "inline-block" };
}

export const inputStyle = {
  width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "11px 12px",
  color: COLORS.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "'Space Grotesk', sans-serif",
};
