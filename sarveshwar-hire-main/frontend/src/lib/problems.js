import { API_BASE } from "../config/constants.js";

export async function fetchProblems() {
  const res = await fetch(`${API_BASE}/api/problems`);
  if (!res.ok) throw new Error("Could not load problem set");
  return res.json();
}
