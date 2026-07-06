// Timer start times and prompt drafts are kept in localStorage, keyed by
// candidate + problem, so a page refresh doesn't reset the countdown or
// lose unsaved work — this is the "auto-save" and timer-resilience layer.
const timerKey = (candidateId, problemId) => `ph_timer_${candidateId}_${problemId}`;
const draftKey = (candidateId, problemId) => `ph_draft_${candidateId}_${problemId}`;

// Timer state is { startedAt, pausedAt, pausedMs }: pausedMs accumulates
// time the candidate spent paused, and pausedAt (when set) is the moment the
// current pause began. Elapsed time excludes all of it, so pausing genuinely
// freezes the countdown and it resumes with the same time remaining.
function readState(candidateId, problemId) {
  try {
    const raw = localStorage.getItem(timerKey(candidateId, problemId));
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through */ }
  return null;
}

function writeState(candidateId, problemId, state) {
  try { localStorage.setItem(timerKey(candidateId, problemId), JSON.stringify(state)); } catch (e) { /* no storage available */ }
}

export function getOrStartTimer(candidateId, problemId) {
  const existing = readState(candidateId, problemId);
  if (existing && typeof existing.startedAt === "number") return existing.startedAt;
  const startedAt = Date.now();
  writeState(candidateId, problemId, { startedAt, pausedAt: null, pausedMs: 0 });
  return startedAt;
}

export function getTimerState(candidateId, problemId) {
  const s = readState(candidateId, problemId);
  if (!s || typeof s.startedAt !== "number") return null;
  return { startedAt: s.startedAt, pausedAt: s.pausedAt ?? null, pausedMs: s.pausedMs || 0 };
}

// Cross-session resume: after a logout/login (or on a different device) the
// localStorage timer is gone, but the authoritative timer state was persisted
// to the candidate record in the DB. Seed it back into localStorage — but only
// if nothing fresher is already here, so we never clobber the live tab.
export function seedTimerState(candidateId, problemId, state) {
  if (!state || typeof state.startedAt !== "number") return;
  if (readState(candidateId, problemId)) return;
  writeState(candidateId, problemId, { startedAt: state.startedAt, pausedAt: state.pausedAt ?? null, pausedMs: state.pausedMs || 0 });
}

// Same idea for the in-progress prompt draft.
export function seedDraft(candidateId, problemId, draft) {
  if (typeof draft !== "string") return;
  try { if (localStorage.getItem(draftKey(candidateId, problemId)) != null) return; } catch (e) { return; }
  saveDraft(candidateId, problemId, draft);
}

export function isPaused(candidateId, problemId) {
  const s = getTimerState(candidateId, problemId);
  return !!(s && s.pausedAt);
}

// Seconds of *active* (non-paused) time elapsed since the timer started.
export function elapsedSec(candidateId, problemId) {
  const s = getTimerState(candidateId, problemId);
  if (!s) return 0;
  const now = Date.now();
  const pausedSoFar = s.pausedMs + (s.pausedAt ? now - s.pausedAt : 0);
  return Math.max(0, (now - s.startedAt - pausedSoFar) / 1000);
}

export function pauseTimer(candidateId, problemId) {
  const s = getTimerState(candidateId, problemId);
  if (!s || s.pausedAt) return; // no timer, or already paused
  writeState(candidateId, problemId, { ...s, pausedAt: Date.now() });
}

export function resumeTimer(candidateId, problemId) {
  const s = getTimerState(candidateId, problemId);
  if (!s || !s.pausedAt) return; // no timer, or not paused
  writeState(candidateId, problemId, { startedAt: s.startedAt, pausedAt: null, pausedMs: s.pausedMs + (Date.now() - s.pausedAt) });
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
