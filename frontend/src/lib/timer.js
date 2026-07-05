// Timer start times and prompt drafts are kept in localStorage, keyed by
// candidate + problem, so a page refresh doesn't reset the countdown or
// lose unsaved work — this is the "auto-save" and timer-resilience layer.
const timerKey = (candidateId, problemId) => `ph_timer_${candidateId}_${problemId}`;
const draftKey = (candidateId, problemId) => `ph_draft_${candidateId}_${problemId}`;

export function getOrStartTimer(candidateId, problemId) {
  const key = timerKey(candidateId, problemId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw).startedAt;
  } catch (e) { /* fall through and start a fresh timer */ }
  const startedAt = Date.now();
  try { localStorage.setItem(key, JSON.stringify({ startedAt })); } catch (e) { /* no storage available */ }
  return startedAt;
}

export function clearTimer(candidateId, problemId) {
  try { localStorage.removeItem(timerKey(candidateId, problemId)); } catch (e) {}
}

export function loadDraft(candidateId, problemId) {
  try {
    const raw = localStorage.getItem(draftKey(candidateId, problemId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export function saveDraft(candidateId, problemId, sections) {
  try { localStorage.setItem(draftKey(candidateId, problemId), JSON.stringify(sections)); } catch (e) {}
}

export function clearDraft(candidateId, problemId) {
  try { localStorage.removeItem(draftKey(candidateId, problemId)); } catch (e) {}
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
