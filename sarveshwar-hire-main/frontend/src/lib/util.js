export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const fmtDate = (ms) => {
  try { return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch (e) { return ""; }
};

export function gradeFor(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export const gradeTone = (grade) => (grade === "A" || grade === "B" ? "teal" : grade === "C" ? "gold" : "rose");

// The headline verdict students are training toward: was this a weak or a
// strong prompt? Driven by the prompt score (prompt-engineering + completeness
// rollup) rather than whether the generated code happened to pass, since the
// whole point is to grade how they prompted.
export function promptVerdict(promptScore) {
  if (promptScore >= 75) return { label: "Strong Prompt", tone: "teal", blurb: "Clear, complete, and specific — this is the standard to aim for." };
  if (promptScore >= 50) return { label: "Moderate Prompt", tone: "gold", blurb: "On the right track, but tighten the gaps below to make it strong." };
  return { label: "Weak Prompt", tone: "rose", blurb: "Under-specified — a real AI would guess or get it wrong. See what's missing below." };
}
