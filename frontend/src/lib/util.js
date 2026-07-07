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
