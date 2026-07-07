// Each student's OpenRouter API key stays in their own browser (localStorage)
// and is never sent anywhere except as the `apiKey` field of our own
// /api/evaluate request — the backend forwards it to OpenRouter for that one
// call and never persists it. Keyed per-student so a shared machine doesn't
// leak one student's key to the next.
function storageKey(studentId) {
  return `openrouter_api_key:${studentId}`;
}

export function getOpenRouterKey(studentId) {
  if (!studentId) return "";
  try { return localStorage.getItem(storageKey(studentId)) || ""; }
  catch (e) { return ""; }
}

export function setOpenRouterKey(studentId, key) {
  if (!studentId) return;
  try {
    const trimmed = (key || "").trim();
    if (trimmed) localStorage.setItem(storageKey(studentId), trimmed);
    else localStorage.removeItem(storageKey(studentId));
  } catch (e) { /* localStorage unavailable — key just won't persist */ }
}
