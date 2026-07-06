import { API_BASE } from "../config/constants.js";
import { getOpenRouterKey } from "./openrouter.js";

// The browser never talks to OpenRouter directly — it hits our backend, which
// holds the authoritative problem/rubric definitions. If the student has
// added their own OpenRouter key (see OpenRouterBanner), it's sent along and
// used for this request only; the backend never stores it.
export async function evaluatePrompt(prompt, problem, studentId) {
  const res = await fetch(`${API_BASE}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, problemId: problem.id, apiKey: getOpenRouterKey(studentId) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Evaluation failed");
  return data;
}
