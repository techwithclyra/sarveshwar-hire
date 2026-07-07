import { API_BASE } from "../config/constants.js";

// The browser never talks to Gemini directly — it hits our backend, which
// holds the API key and the authoritative problem/rubric definitions.
export async function evaluateWithClaude(prompt, problem) {
  const res = await fetch(`${API_BASE}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, problemId: problem.id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Evaluation failed");
  return data;
}
