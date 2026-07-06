import React, { useState, useEffect, useRef, useMemo } from "react";
import { FileText, Sparkles, Play, Loader2, AlertTriangle, Check, X, ThumbsUp, ThumbsDown, Lightbulb, ListChecks, Lock, RotateCcw, PartyPopper, ArrowRight, Pause, PlayCircle, SkipForward } from "lucide-react";
import { COLORS } from "../config/colors.js";
import { DB } from "../lib/db.js";
import { fetchProblems } from "../lib/problems.js";
import { evaluateWithClaude } from "../lib/evaluate.js";
import { runInWorker, outputsMatch, outputsMatchExact } from "../lib/sandbox.js";
import { gradeFor, gradeTone, fmtDate } from "../lib/util.js";
import { CountdownTimer } from "./CountdownTimer.jsx";
import { getOrStartTimer, getTimerState, seedTimerState, seedDraft, clearTimer, loadDraft, saveDraft, clearDraft, formatClock, elapsedSec, pauseTimer, resumeTimer, isPaused } from "../lib/timer.js";
import { resolveAssignedInstances } from "../lib/assignments.js";
import { Pill, ScoreRing, label, inputStyle } from "./ui.jsx";

// Deterministic per-student shuffle: each candidate still gets a randomized
// problem order, but the SAME order every time they log in — so logging out
// and back in resumes the same sequence instead of reshuffling underneath them.
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seededShuffle(arr, seedStr) {
  const a = [...arr];
  let seed = hashString(seedStr || "seed") || 1;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function CandidateWorkspace({ candidate, setCandidate }) {
  const [problems, setProblems] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [instanceIdx, setInstanceIdx] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [genCode, setGenCode] = useState("");
  const [rubric, setRubric] = useState(null);
  const [testResults, setTestResults] = useState([]);
  const [scores, setScores] = useState(null);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [lastAttempt, setLastAttempt] = useState(null);
  const [remainingSec, setRemainingSec] = useState(null);
  const [advanceMessage, setAdvanceMessage] = useState("");
  const [paused, setPaused] = useState(false);

  const promptRef = useRef(prompt);
  const startedAtRef = useRef(null);
  const timerKeyRef = useRef(null);
  const busyRef = useRef(false);
  const lockedRef = useRef(false);
  const instanceRef = useRef(null);
  const pausedRef = useRef(false);
  const candidateRef = useRef(candidate);

  useEffect(() => {
    Promise.all([fetchProblems(), DB.listAssignments()])
      .then(([p, a]) => { setProblems(p); setAssignments(a); setLoaded(true); })
      .catch((e) => setLoadError(e.message || "Could not load your assignments"));
  }, []);

  const student = candidate.student || candidate;
  // Resolved once per session and shuffled, so problems appear in random
  // order and stay in that order as the student advances through them.
  const instances = useMemo(() => seededShuffle(resolveAssignedInstances(assignments, problems, student), student.id || student.email || ""), [assignments, problems, student]);
  const instance = instances[instanceIdx];
  const done = loaded && instances.length > 0 && instanceIdx >= instances.length;

  useEffect(() => { promptRef.current = prompt; }, [prompt]);
  useEffect(() => { lockedRef.current = locked; }, [locked]);
  useEffect(() => { instanceRef.current = instance; }, [instance]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { candidateRef.current = candidate; }, [candidate]);

  function beginAttempt(inst, candidateNow) {
    const { problem, assignment } = inst;
    const priorAttempts = (candidateNow.attempts || []).filter((a) => a.problemId === problem.id);
    const attemptIndex = priorAttempts.length;
    const timerKeyId = `${problem.id}__a${attemptIndex}`;
    timerKeyRef.current = timerKeyId;

    // Cross-session resume: after a logout/login (or on another device) the
    // localStorage timer + draft are gone. Seed them from the in-progress
    // record we persisted to the DB, so the candidate lands exactly where they
    // left off — same remaining time, same pause state, same draft prompt.
    const dbEntry = (candidateNow.inProgress || []).find((ip) => ip.problemId === problem.id && ip.attemptIndex === attemptIndex);
    if (dbEntry) {
      seedTimerState(candidateNow.id, timerKeyId, { startedAt: dbEntry.startedAt, pausedAt: dbEntry.pausedAt, pausedMs: dbEntry.pausedMs });
      if (typeof dbEntry.draft === "string") seedDraft(candidateNow.id, timerKeyId, dbEntry.draft);
    }

    const startedAt = getOrStartTimer(candidateNow.id, timerKeyId);
    startedAtRef.current = startedAt;
    const draft = loadDraft(candidateNow.id, timerKeyId);
    setPrompt(typeof draft === "string" ? draft : "");
    setRemainingSec(Math.max(0, assignment.timeLimitMinutes * 60 - elapsedSec(candidateNow.id, timerKeyId)));
    // Restore the paused state too, so a refresh (or re-login) mid-pause stays paused.
    const wasPaused = isPaused(candidateNow.id, timerKeyId);
    setPaused(wasPaused); pausedRef.current = wasPaused;
    setLocked(false); setLastAttempt(null); setAdvanceMessage("");
    setGenCode(""); setRubric(null); setTestResults([]); setScores(null); setError(""); setStatus("");
    busyRef.current = false;

    // Always (re)write the full resumable entry to the DB, so the timer start,
    // pause state, and draft are recoverable from any device — not just this
    // browser's localStorage.
    const updated = writeProgressToCandidate(candidateNow, { problem, assignment, attemptIndex, timerKeyId, draft: typeof draft === "string" ? draft : "" });
    setCandidate(updated);
    DB.saveCandidate(updated);
  }

  // Build a candidate object whose inProgress carries the full resumable state
  // for the given attempt (timer start, accumulated pause, current pause flag,
  // and the draft prompt). Pure — callers decide when to setCandidate/save.
  function writeProgressToCandidate(candidateNow, { problem, assignment, attemptIndex, timerKeyId, draft }) {
    const ts = getTimerState(candidateNow.id, timerKeyId) || {};
    const entry = {
      problemId: problem.id, assignmentId: assignment.id, attemptIndex,
      startedAt: ts.startedAt ?? startedAtRef.current,
      pausedAt: ts.pausedAt ?? null, pausedMs: ts.pausedMs || 0, paused: !!ts.pausedAt,
      draft: typeof draft === "string" ? draft : promptRef.current,
      updatedAt: Date.now(),
    };
    return {
      ...candidateNow,
      inProgress: [...(candidateNow.inProgress || []).filter((ip) => ip.problemId !== problem.id), entry],
    };
  }

  // Persist the current attempt's resumable state (timer + pause + draft) to
  // the DB. Called on pause/resume, on a slow autosave tick, and on tab close.
  function persistProgress(draftOverride) {
    const inst = instanceRef.current;
    const candidateNow = candidateRef.current;
    if (!inst || lockedRef.current || !timerKeyRef.current || !candidateNow) return;
    const { problem, assignment } = inst;
    const attemptIndex = (candidateNow.attempts || []).filter((a) => a.problemId === problem.id).length;
    const draft = typeof draftOverride === "string" ? draftOverride : promptRef.current;
    saveDraft(candidateNow.id, timerKeyRef.current, draft); // keep localStorage fresh too
    const updated = writeProgressToCandidate(candidateNow, { problem, assignment, attemptIndex, timerKeyId: timerKeyRef.current, draft });
    setCandidate(updated);
    DB.saveCandidate(updated);
  }

  // Switching problems: either lock into the summary of a fully-used
  // problem, or resume/start the timer + auto-saved draft for the attempt
  // currently in progress.
  useEffect(() => {
    if (!instance || !candidate) return;
    const { problem, assignment } = instance;
    const priorAttempts = (candidate.attempts || []).filter((a) => a.problemId === problem.id);
    if (priorAttempts.length >= assignment.maxAttempts) {
      setLocked(true);
      setLastAttempt(priorAttempts[priorAttempts.length - 1]);
      setPrompt("");
      setRemainingSec(null);
      setPaused(false); pausedRef.current = false;
      setGenCode(""); setRubric(null); setTestResults([]); setScores(null); setError(""); setStatus("");
      busyRef.current = false;
      return;
    }
    beginAttempt(instance, candidate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.problem?.id, candidate?.id]);

  // Auto-save the draft at regular intervals so a refresh doesn't lose work.
  // localStorage every 5s (cheap, same-browser resilience); the DB every 20s
  // (so a logout/login on any device can restore the draft + timer + pause).
  useEffect(() => {
    if (!instance || locked) return;
    let ticks = 0;
    const id = setInterval(() => {
      if (!timerKeyRef.current) return;
      saveDraft(candidate.id, timerKeyRef.current, promptRef.current);
      if (++ticks % 4 === 0 && !pausedRef.current) persistProgress();
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.problem?.id, locked, candidate?.id]);

  // Persist the resumable state when the tab is closed or the page is hidden
  // (e.g. the candidate closes the browser to come back later on another
  // device) — best-effort, so we don't lose the last few seconds of work.
  useEffect(() => {
    const flush = () => { if (!lockedRef.current) persistProgress(); };
    window.addEventListener("pagehide", flush);
    window.addEventListener("visibilitychange", flush);
    return () => { window.removeEventListener("pagehide", flush); window.removeEventListener("visibilitychange", flush); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id]);

  // Countdown tick — auto-submits the instant it reaches zero.
  useEffect(() => {
    if (!instance || locked) return;
    const limitSec = instance.assignment.timeLimitMinutes * 60;
    const tick = () => {
      // elapsedSec excludes paused time, so a paused countdown holds steady.
      const rem = Math.max(0, limitSec - elapsedSec(candidate.id, timerKeyRef.current));
      setRemainingSec(rem);
      if (rem <= 0 && !busyRef.current && !lockedRef.current && !pausedRef.current) runEvaluation("auto");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.problem?.id, locked]);

  // Passing (100% test cases) or running out of attempts both move the
  // student on automatically — this is a linear, one-at-a-time flow with no
  // way to navigate backward to a previous problem.
  useEffect(() => {
    if (!scores || !instance) return;
    const priorCount = (candidate.attempts || []).filter((a) => a.problemId === instance.problem.id).length;
    const remaining = instance.assignment.maxAttempts - priorCount;
    const passed = scores.codeCorrectnessScore === 100;
    if (!passed && remaining > 0) return;
    setAdvanceMessage(passed ? "Correct! Moving to the next problem…" : "No attempts remaining — moving to the next problem…");
    const t = setTimeout(() => setInstanceIdx((i) => i + 1), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores]);

  // Pause freezes the countdown and locks the editor; resume continues with
  // the same time remaining. Disabled while an evaluation is running.
  function togglePause() {
    if (!timerKeyRef.current || locked || running) return;
    if (pausedRef.current) {
      resumeTimer(candidate.id, timerKeyRef.current);
      setPaused(false); pausedRef.current = false;
    } else {
      saveDraft(candidate.id, timerKeyRef.current, promptRef.current); // don't lose the in-flight prompt
      pauseTimer(candidate.id, timerKeyRef.current);
      setPaused(true); pausedRef.current = true;
    }
    // Persist the new pause state + draft to the DB so the candidate can log
    // out here and resume — still paused, same time left — from any device.
    persistProgress();
  }

  // Advance to the next problem in the (stable) sequence. Used by the manual
  // "Next Problem" buttons and after a skip.
  function goNext() {
    setInstanceIdx((i) => i + 1);
  }

  // "I don't know this one" — skip to the next problem WITHOUT running an
  // evaluation. We still record a per-problem result (score 0, marked skipped)
  // so the admin gets an individual entry for every assigned problem rather
  // than a silent gap. Linear flow: there's no coming back to it.
  function skipProblem() {
    const inst = instanceRef.current;
    if (busyRef.current || lockedRef.current || !inst) return;
    if (!window.confirm("Skip this problem? It will be recorded as unsolved (score 0) and you won't be able to return to it.")) return;
    const { problem, assignment } = inst;
    const timerKeyId = timerKeyRef.current;
    const startedAt = startedAtRef.current;
    const currentPrompt = promptRef.current;
    const submittedAt = Date.now();
    const timeTakenSec = timerKeyId ? Math.round(elapsedSec(candidate.id, timerKeyId)) : 0;
    const timeRemainingSec = Math.max(0, Math.round(assignment.timeLimitMinutes * 60 - timeTakenSec));

    const attempt = {
      problemId: problem.id, assignmentId: assignment.id, title: problem.title,
      overall: 0, grade: gradeFor(0), promptScore: 0, codingScore: 0, promptQualityScore: 0,
      passed: 0, total: (problem.testCases || []).length, at: submittedAt, startedAt, submittedAt,
      timeTakenSec, timeRemainingSec, submissionType: "skipped",
      prompt: currentPrompt, code: "", feedback: "Skipped by the candidate — recorded as unsolved.",
      strengths: [], weaknesses: [], suggestions: [], rubric: [],
    };
    const updated = {
      ...candidate,
      attempts: [...(candidate.attempts || []), attempt],
      inProgress: (candidate.inProgress || []).filter((ip) => ip.problemId !== problem.id),
    };
    setCandidate(updated);
    DB.saveCandidate(updated);
    if (timerKeyId) { clearTimer(candidate.id, timerKeyId); clearDraft(candidate.id, timerKeyId); }
    setPaused(false); pausedRef.current = false;
    goNext();
  }

  async function runEvaluation(submissionType = "manual") {
    const inst = instanceRef.current;
    if (busyRef.current || lockedRef.current || !inst) return;
    const { problem, assignment } = inst;
    busyRef.current = true;
    // Submitting ends any pause — the countdown state is cleared below anyway.
    if (pausedRef.current) { resumeTimer(candidate.id, timerKeyRef.current); setPaused(false); pausedRef.current = false; }
    setRunning(true); setError(""); setGenCode(""); setRubric(null); setTestResults([]); setScores(null);
    setStatus("Generating a solution from your prompt…");
    const startedAt = startedAtRef.current;
    const timerKeyId = timerKeyRef.current;
    const currentPrompt = promptRef.current;
    const activeSec = Math.round(elapsedSec(candidate.id, timerKeyId));
    try {
      const ev = await evaluateWithClaude(currentPrompt, problem);
      setGenCode(ev.code); setRubric(ev.rubric); setStatus("Running real test cases…");
      const results = [];
      for (const tc of problem.testCases) {
        const r = await runInWorker(ev.code, tc.input, 2500);
        const got = r.ok ? r.output : (r.error || "error");
        const pass = r.ok && outputsMatch(got, tc.expected, problem.unordered);
        const exact = r.ok && outputsMatchExact(got, tc.expected);
        results.push({ input: tc.input, expected: tc.expected, got, pass, exact, errored: !r.ok });
        setTestResults([...results]);
      }
      const passedCount = results.filter((r) => r.pass).length;
      const exactMatches = results.filter((r) => r.exact).length;
      const total = results.length;

      // The PROMPT score is computed and validated server-side from a fixed,
      // weighted 6-criterion rubric (Goal / Context / Constraints / Output
      // Format / Examples / Success Criteria) — the client just consumes it.
      const promptQualityScore = ev.promptScore;
      const codeCorrectnessScore = total ? Math.round((passedCount / total) * 100) : 0;
      const outputAccuracyScore = total ? Math.round((exactMatches / total) * 100) : 0;
      const codeEfficiencyScore = ev.efficiencyScore;

      // Prompt-dominant scoring: the candidate's PROMPT drives 70% of the grade;
      // the generated code's behaviour is the remaining 30% (correctness 18% +
      // efficiency 7% + output accuracy 5%). The two headline numbers (Prompt
      // Score / Coding Score) are each a normalized rollup of their group.
      const promptScore = promptQualityScore;
      const codingScore = Math.round((codeCorrectnessScore * 18 + codeEfficiencyScore * 7 + outputAccuracyScore * 5) / 30);
      const overall = Math.round(
        promptQualityScore * 0.70 +
        codeCorrectnessScore * 0.18 + codeEfficiencyScore * 0.07 + outputAccuracyScore * 0.05
      );
      const grade = gradeFor(overall);

      const submittedAt = Date.now();
      const timeLimitSec = assignment.timeLimitMinutes * 60;
      // Active time only — paused stretches don't count against the candidate.
      const timeTakenSec = activeSec;
      const timeRemainingSec = Math.max(0, Math.round(timeLimitSec - timeTakenSec));

      setScores({
        promptScore, codingScore, overall, grade, passed: passedCount, total,
        promptQualityScore, codeCorrectnessScore, codeEfficiencyScore, outputAccuracyScore, efficiencyNote: ev.efficiencyNote,
        feedback: ev.feedback, strengths: ev.strengths, weaknesses: ev.weaknesses, suggestions: ev.suggestions,
        injectionDetected: ev.injectionDetected, injectionNote: ev.injectionNote,
        submissionType, startedAt, submittedAt, timeTakenSec, timeRemainingSec,
      });
      setStatus("");

      // Full detail persisted (not just scores) so admin can review the
      // actual prompt, generated code, and AI feedback per submission.
      const attempt = {
        problemId: problem.id, assignmentId: assignment.id, title: problem.title, overall, grade, promptScore, codingScore,
        passed: passedCount, total, at: submittedAt, startedAt, submittedAt, timeTakenSec, timeRemainingSec, submissionType,
        prompt: currentPrompt, code: ev.code, feedback: ev.feedback, strengths: ev.strengths, weaknesses: ev.weaknesses,
        suggestions: ev.suggestions, rubric: ev.rubric, promptQualityScore, injectionDetected: ev.injectionDetected,
      };
      const updated = {
        ...candidate,
        attempts: [...(candidate.attempts || []), attempt],
        inProgress: (candidate.inProgress || []).filter((ip) => ip.problemId !== problem.id),
      };
      setCandidate(updated);
      await DB.saveCandidate(updated);
      clearTimer(candidate.id, timerKeyId);
      clearDraft(candidate.id, timerKeyId);
    } catch (e) {
      setError(e.message || "Evaluation failed. Check the connection and try again.");
      setStatus("");
      busyRef.current = false;
    } finally {
      setRunning(false);
    }
  }

  if (loadError) {
    return <div style={{ color: COLORS.rose, padding: 24 }}><AlertTriangle size={14} style={{ marginRight: 6 }} />{loadError}</div>;
  }
  if (!loaded) {
    return <div style={{ color: COLORS.muted, padding: 24, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={14} className="ph-spin" />Loading your assignments…</div>;
  }
  if (instances.length === 0) {
    return <div style={{ color: COLORS.muted, padding: 24 }}>No problems have been assigned to you yet. Check back once your admin publishes an assignment.</div>;
  }
  if (done) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: COLORS.text }}>
        <PartyPopper size={32} color={COLORS.gold} />
        <div style={{ fontSize: 18, fontWeight: 700 }}>You've completed all assigned problems.</div>
        <div style={{ color: COLORS.muted, fontSize: 13 }}>Check the History screen to review your scores and feedback.</div>
      </div>
    );
  }
  if (!instance) {
    return <div style={{ color: COLORS.muted, padding: 24, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={14} className="ph-spin" />Loading…</div>;
  }

  const { problem, assignment } = instance;
  const priorAttemptsNow = (candidate.attempts || []).filter((a) => a.problemId === problem.id);
  const attemptsRemaining = assignment.maxAttempts - priorAttemptsNow.length;
  const summary = scores || (locked && assignment.allowRevisit ? lastAttempt : null);
  const revisitBlocked = locked && !assignment.allowRevisit;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {!locked && remainingSec != null && (
        <div style={{ display: "flex", gap: 12, alignItems: "stretch", marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <CountdownTimer remainingSec={remainingSec} totalSec={assignment.timeLimitMinutes * 60} paused={paused} />
          </div>
          <button
            onClick={togglePause} disabled={running}
            title={paused ? "Resume the countdown" : "Pause the countdown and lock the editor"}
            style={{
              display: "flex", alignItems: "center", gap: 7, background: paused ? COLORS.teal : COLORS.panelAlt,
              color: paused ? "#04211C" : COLORS.text, border: `1px solid ${paused ? COLORS.teal : COLORS.border}`,
              borderRadius: 10, padding: "0 18px", fontSize: 13, fontWeight: 700, cursor: running ? "not-allowed" : "pointer",
            }}
          >
            {paused ? <><PlayCircle size={15} />Resume</> : <><Pause size={15} />Pause</>}
          </button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 16, flex: 1, minHeight: 0 }} className="ph-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, maxHeight: "38%", overflowY: "auto", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><FileText size={15} color={COLORS.muted} /><span style={label()}>Problem Statement · Read Only</span></div>
              <Pill tone={problem.difficulty === "Hard" ? "rose" : problem.difficulty === "Medium" ? "gold" : "teal"}>{problem.difficulty}</Pill>
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>{problem.title}</div>
            <p style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>{problem.statement}</p>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12, color: COLORS.muted, lineHeight: 1.7 }}>
              <div>Constraints: {problem.constraints}</div>
              <div style={{ color: COLORS.text, marginTop: 6 }}>Input</div><div>{problem.inputFormat}</div>
              <div style={{ color: COLORS.text, marginTop: 6 }}>Output</div><div>{problem.outputFormat}</div>
            </div>
            {problem.idealTraits?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><ListChecks size={12} color={COLORS.muted} /><span style={label()}>Evaluation Criteria</span></div>
                <ul style={{ margin: 0, paddingLeft: 18, color: COLORS.muted, fontSize: 12.5, lineHeight: 1.7 }}>
                  {problem.idealTraits.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
          </div>
          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, flex: 1, display: "flex", flexDirection: "column", minHeight: 200 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Sparkles size={15} color={COLORS.gold} /><span style={label(COLORS.gold)}>Your Prompt · This Is What's Scored</span></div>
              {!locked && <span style={{ fontSize: 11, color: COLORS.muted }}>{prompt.length} chars{assignment.maxAttempts > 1 ? ` · attempt ${priorAttemptsNow.length + 1} of ${assignment.maxAttempts}` : ""}</span>}
            </div>
            {locked ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: COLORS.muted, textAlign: "center", gap: 8 }}>
                <Lock size={20} />
                <div style={{ fontSize: 13 }}>
                  {revisitBlocked
                    ? "Submitted — this assignment doesn't allow revisiting previous submissions."
                    : "No attempts remaining for this problem."}
                </div>
                {instanceIdx < instances.length && (
                  <button
                    onClick={goNext}
                    style={{ display: "flex", alignItems: "center", gap: 7, background: COLORS.teal, color: "#04211C", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 4 }}
                  >
                    Next Problem<ArrowRight size={15} />
                  </button>
                )}
              </div>
            ) : paused ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: COLORS.muted, textAlign: "center", gap: 10 }}>
                <Pause size={22} color={COLORS.gold} />
                <div style={{ fontSize: 13 }}>Paused — the countdown is frozen and your prompt is saved. You can safely log out and resume this problem later (from any device) right where you left off.</div>
                <button
                  onClick={togglePause}
                  style={{ display: "flex", alignItems: "center", gap: 7, background: COLORS.teal, color: "#04211C", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  <PlayCircle size={15} />Resume
                </button>
              </div>
            ) : (
              <>
                <textarea
                  value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={running}
                  placeholder="Instruct the AI how to solve this. Assign it a role, state the goal, give context, name constraints and edge cases, and specify the exact output format. The more precisely you write this, the more correct the generated code will be."
                  style={{ flex: 1, resize: "none", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 14, color: COLORS.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, lineHeight: 1.6, outline: "none" }}
                />
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <button
                    onClick={skipProblem} disabled={running}
                    title="Don't know this one? Skip it and move to the next problem (recorded as unsolved)."
                    style={{ display: "flex", alignItems: "center", gap: 7, background: "transparent", color: COLORS.muted, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: running ? "not-allowed" : "pointer" }}
                  >
                    <SkipForward size={15} />Skip / Next
                  </button>
                  <button
                    onClick={() => runEvaluation("manual")} disabled={running || !prompt.trim()}
                    style={{ display: "flex", alignItems: "center", gap: 8, background: running || !prompt.trim() ? COLORS.panelAlt : COLORS.teal, color: running || !prompt.trim() ? COLORS.muted : "#04211C", border: "none", borderRadius: 8, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: running || !prompt.trim() ? "not-allowed" : "pointer" }}
                  >
                    {running ? <Loader2 size={16} className="ph-spin" /> : <Play size={16} />}
                    {running ? (status || "Evaluating…") : "Run Evaluation"}
                  </button>
                </div>
                {error && <div style={{ color: COLORS.rose, fontSize: 12.5, marginTop: 10, display: "flex", gap: 6 }}><AlertTriangle size={13} style={{ marginTop: 1 }} />{error}</div>}
              </>
            )}
          </div>
        </div>

        <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18, minHeight: 0 }}>
          {summary ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <ScoreRing value={summary.overall} />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 12, color: COLORS.muted }}>Overall Score</div>
                    <Pill tone={gradeTone(summary.grade)}>Grade {summary.grade}</Pill>
                  </div>
                  <div style={{ fontSize: 13, color: COLORS.text, marginTop: 4 }}>{summary.passed}/{summary.total} tests passed</div>
                  {scores?.feedback && <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 6, lineHeight: 1.5 }}>{scores.feedback}</div>}
                </div>
              </div>
              {scores?.injectionDetected && (
                <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "flex-start", background: "rgba(232,96,122,0.12)", border: `1px solid ${COLORS.rose}`, borderRadius: 8, padding: 10, fontSize: 12, color: COLORS.text }}>
                  <AlertTriangle size={14} color={COLORS.rose} style={{ marginTop: 1, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, color: COLORS.rose }}>Prompt-injection attempt ignored</div>
                    <div style={{ color: COLORS.muted, marginTop: 2 }}>Instructions aimed at the grader were treated as data and did not affect your score.{scores.injectionNote ? ` (${scores.injectionNote})` : ""}</div>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 14, display: "grid", gap: 4, fontSize: 11, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>
                <div>Started {fmtDate(summary.startedAt)} · Submitted {fmtDate(summary.submittedAt)}</div>
                <div>
                  Time taken {formatClock(summary.timeTakenSec)}
                  {summary.timeRemainingSec != null ? ` · ${formatClock(summary.timeRemainingSec)} remaining` : ""}
                  {" · "}{summary.submissionType === "auto" ? "Auto-submitted after timeout" : summary.submissionType === "skipped" ? "Skipped (unsolved)" : "Manual submission"}
                </div>
              </div>
              {advanceMessage && (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, color: COLORS.gold, fontSize: 12.5, fontWeight: 600 }}>
                  <ArrowRight size={14} />{advanceMessage}
                </div>
              )}
              {scores && !advanceMessage && (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {attemptsRemaining > 0 && (
                    <button
                      onClick={() => beginAttempt(instance, candidate)}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.panelAlt, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 12.5, cursor: "pointer" }}
                    >
                      <RotateCcw size={13} />Try Again ({attemptsRemaining} attempt{attemptsRemaining === 1 ? "" : "s"} left)
                    </button>
                  )}
                  {instanceIdx < instances.length && (
                    <button
                      onClick={goNext}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.teal, color: "#04211C", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
                    >
                      Next Problem<ArrowRight size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.6 }}>
              {status || "Write a prompt and run the evaluation to see your score, generated code, rubric results, and test outcomes here."}
            </div>
          )}

          {summary && (
            <div>
              <div style={label()}>Score Breakdown</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, color: COLORS.muted }}>Prompt Score</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{summary.promptScore}</div>
                </div>
                <div style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, color: COLORS.muted }}>Coding Score</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{summary.codingScore}</div>
                </div>
              </div>
            </div>
          )}

          {scores?.strengths?.length > 0 && (
            <div>
              <div style={label(COLORS.teal)}>Strengths</div>
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {scores.strengths.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: COLORS.text }}>
                    <ThumbsUp size={13} color={COLORS.teal} style={{ marginTop: 2, flexShrink: 0 }} />{s}
                  </div>
                ))}
              </div>
            </div>
          )}

          {scores?.weaknesses?.length > 0 && (
            <div>
              <div style={label(COLORS.rose)}>{scores.promptQualityScore < 60 ? "Why This Prompt Is Weak" : "Weaknesses"}</div>
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {scores.weaknesses.map((w, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: COLORS.text }}>
                    <ThumbsDown size={13} color={COLORS.rose} style={{ marginTop: 2, flexShrink: 0 }} />{w}
                  </div>
                ))}
              </div>
            </div>
          )}

          {scores?.suggestions?.length > 0 && (
            <div>
              <div style={label(COLORS.gold)}>Suggestions For Improvement</div>
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {scores.suggestions.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: COLORS.text }}>
                    <Lightbulb size={13} color={COLORS.gold} style={{ marginTop: 2, flexShrink: 0 }} />{s}
                  </div>
                ))}
              </div>
            </div>
          )}

          {rubric && (
            <div>
              <div style={label()}>Prompt Rubric · {summary?.promptScore ?? scores?.promptScore}/100</div>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {rubric.map((r, i) => {
                  const max = r.maxScore ?? 2;
                  const tone = r.score >= max ? COLORS.teal : r.score > 0 ? COLORS.gold : COLORS.rose;
                  const Icon = r.score >= max ? Check : r.score > 0 ? AlertTriangle : X;
                  return (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 10 }}>
                      <Icon size={14} color={tone} style={{ marginTop: 2, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}>
                          <span>{r.criterion}{r.weight != null ? <span style={{ color: COLORS.muted }}> · {r.weight}%</span> : null}</span>
                          <span style={{ color: tone, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{r.score}/{max}</span>
                        </div>
                        {(r.evidence || r.note) && <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 2, lineHeight: 1.5 }}>{r.evidence || r.note}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {testResults.length > 0 && (
            <div>
              <div style={label()}>Test Cases</div>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {testResults.map((t, i) => (
                  <div key={i} style={{ background: COLORS.bg, border: `1px solid ${t.pass ? "rgba(62,217,196,0.3)" : "rgba(232,96,122,0.3)"}`, borderRadius: 8, padding: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ color: COLORS.muted }}>Case {i + 1}</span>
                      {t.pass ? <Check size={13} color={COLORS.teal} /> : <X size={13} color={COLORS.rose} />}
                    </div>
                    <div style={{ color: COLORS.muted }}>expected: {t.expected}</div>
                    <div style={{ color: t.pass ? COLORS.text : COLORS.rose }}>got: {t.got}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {genCode && (
            <div>
              <div style={label()}>Generated Solution</div>
              <pre style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12, fontSize: 11, color: COLORS.muted, overflowX: "auto", fontFamily: "'JetBrains Mono', monospace", marginTop: 8 }}>{genCode}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
