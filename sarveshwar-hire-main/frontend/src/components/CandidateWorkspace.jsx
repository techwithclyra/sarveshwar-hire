import React, { useState, useEffect, useRef, useMemo } from "react";
import { FileText, Sparkles, Play, Loader2, AlertTriangle, Check, X, ThumbsUp, ThumbsDown, Lightbulb, ListChecks, Lock, RotateCcw, PartyPopper, ArrowRight, SkipForward } from "lucide-react";
import { COLORS } from "../config/colors.js";
import { DB } from "../lib/db.js";
import { fetchProblems } from "../lib/problems.js";
import { evaluateWithClaude } from "../lib/evaluate.js";
import { runInWorker, outputsMatch, outputsMatchExact } from "../lib/sandbox.js";
import { gradeFor, gradeTone, fmtDate, promptVerdict } from "../lib/util.js";
import { CountdownTimer } from "./CountdownTimer.jsx";
import { getOrStartTimer, clearTimer, loadDraft, saveDraft, clearDraft, formatClock } from "../lib/timer.js";
import { resolveAssignedInstances } from "../lib/assignments.js";
import { Pill, ScoreRing, label, inputStyle } from "./ui.jsx";

// Used only for the deterministic "Prompt Completeness" component of the
// score (10% weight) — a rough proxy for how much detail was actually
// written, independent of the AI's own holistic 40% judgment.
const COMPLETENESS_LENGTH_TARGET = 150;

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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

  const promptRef = useRef(prompt);
  const startedAtRef = useRef(null);
  const timerKeyRef = useRef(null);
  const busyRef = useRef(false);
  const lockedRef = useRef(false);
  const instanceRef = useRef(null);

  useEffect(() => {
    Promise.all([fetchProblems(), DB.listAssignments()])
      .then(([p, a]) => { setProblems(p); setAssignments(a); setLoaded(true); })
      .catch((e) => setLoadError(e.message || "Could not load your assignments"));
  }, []);

  const student = candidate.student || candidate;
  // Resolved once per session and shuffled, so problems appear in random
  // order and stay in that order as the student advances through them.
  const instances = useMemo(() => shuffled(resolveAssignedInstances(assignments, problems, student)), [assignments, problems, student]);
  const instance = instances[instanceIdx];
  const done = loaded && instances.length > 0 && instanceIdx >= instances.length;

  useEffect(() => { promptRef.current = prompt; }, [prompt]);
  useEffect(() => { lockedRef.current = locked; }, [locked]);
  useEffect(() => { instanceRef.current = instance; }, [instance]);

  function beginAttempt(inst, candidateNow) {
    const { problem, assignment } = inst;
    const priorAttempts = (candidateNow.attempts || []).filter((a) => a.problemId === problem.id);
    const attemptIndex = priorAttempts.length;
    const timerKeyId = `${problem.id}__a${attemptIndex}`;
    timerKeyRef.current = timerKeyId;

    const startedAt = getOrStartTimer(candidateNow.id, timerKeyId);
    startedAtRef.current = startedAt;
    const draft = loadDraft(candidateNow.id, timerKeyId);
    setPrompt(typeof draft === "string" ? draft : "");
    setRemainingSec(Math.max(0, assignment.timeLimitMinutes * 60 - (Date.now() - startedAt) / 1000));
    setLocked(false); setLastAttempt(null); setAdvanceMessage("");
    setGenCode(""); setRubric(null); setTestResults([]); setScores(null); setError(""); setStatus("");
    busyRef.current = false;

    const already = (candidateNow.inProgress || []).some((ip) => ip.problemId === problem.id && ip.attemptIndex === attemptIndex);
    if (!already) {
      const updated = {
        ...candidateNow,
        inProgress: [...(candidateNow.inProgress || []).filter((ip) => ip.problemId !== problem.id), { problemId: problem.id, assignmentId: assignment.id, attemptIndex, startedAt }],
      };
      setCandidate(updated);
      DB.saveCandidate(updated);
    }
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
      setGenCode(""); setRubric(null); setTestResults([]); setScores(null); setError(""); setStatus("");
      busyRef.current = false;
      return;
    }
    beginAttempt(instance, candidate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.problem?.id, candidate?.id]);

  // Auto-save the draft at regular intervals so a refresh doesn't lose work.
  useEffect(() => {
    if (!instance || locked) return;
    const id = setInterval(() => {
      if (timerKeyRef.current) saveDraft(candidate.id, timerKeyRef.current, promptRef.current);
    }, 5000);
    return () => clearInterval(id);
  }, [instance?.problem?.id, locked, candidate?.id]);

  // Countdown tick — auto-submits the instant it reaches zero.
  useEffect(() => {
    if (!instance || locked) return;
    const limitSec = instance.assignment.timeLimitMinutes * 60;
    const tick = () => {
      const rem = Math.max(0, limitSec - (Date.now() - startedAtRef.current) / 1000);
      setRemainingSec(rem);
      if (rem <= 0 && !busyRef.current && !lockedRef.current) runEvaluation("auto");
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

  async function runEvaluation(submissionType = "manual") {
    const inst = instanceRef.current;
    if (busyRef.current || lockedRef.current || !inst) return;
    const { problem, assignment } = inst;
    busyRef.current = true;
    setRunning(true); setError(""); setGenCode(""); setRubric(null); setTestResults([]); setScores(null);
    setStatus("Generating a solution from your prompt…");
    const startedAt = startedAtRef.current;
    const timerKeyId = timerKeyRef.current;
    const currentPrompt = promptRef.current;
    try {
      const ev = await evaluateWithClaude(currentPrompt, problem);
      setGenCode(ev.code); setRubric(ev.promptRubric); setStatus("Running real test cases…");
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

      const promptEngineeringScore = Math.round((ev.promptRubric.filter((x) => x.met).length / ev.promptRubric.length) * 100);
      const promptCompletenessScore = Math.min(100, Math.round((currentPrompt.trim().length / COMPLETENESS_LENGTH_TARGET) * 100));
      const codeCorrectnessScore = total ? Math.round((passedCount / total) * 100) : 0;
      const outputAccuracyScore = total ? Math.round((exactMatches / total) * 100) : 0;
      const codeEfficiencyScore = ev.efficiencyScore;

      // Displayed as two headline numbers (Prompt Score / Coding Score), each
      // a normalized rollup of the weighted criteria that belong to it, plus
      // the full 5-criteria weighted Overall Score used for the official grade.
      const promptScore = Math.round((promptEngineeringScore * 40 + promptCompletenessScore * 10) / 50);
      const codingScore = Math.round((codeCorrectnessScore * 25 + codeEfficiencyScore * 15 + outputAccuracyScore * 10) / 50);
      const overall = Math.round(
        promptEngineeringScore * 0.4 + codeCorrectnessScore * 0.25 + codeEfficiencyScore * 0.15 +
        promptCompletenessScore * 0.1 + outputAccuracyScore * 0.1
      );
      const grade = gradeFor(overall);

      const submittedAt = Date.now();
      const timeLimitSec = assignment.timeLimitMinutes * 60;
      const timeTakenSec = Math.round((submittedAt - startedAt) / 1000);
      const timeRemainingSec = Math.max(0, Math.round(timeLimitSec - timeTakenSec));

      setScores({
        promptScore, codingScore, overall, grade, passed: passedCount, total,
        promptEngineeringScore, promptCompletenessScore, codeCorrectnessScore, codeEfficiencyScore, outputAccuracyScore,
        feedback: ev.feedback, strengths: ev.strengths, weaknesses: ev.weaknesses, suggestions: ev.suggestions,
        submissionType, startedAt, submittedAt, timeTakenSec, timeRemainingSec,
      });
      setStatus("");

      // Full detail persisted (not just scores) so admin can review the
      // actual prompt, generated code, and AI feedback per submission.
      const attempt = {
        problemId: problem.id, assignmentId: assignment.id, title: problem.title, overall, grade, promptScore, codingScore,
        passed: passedCount, total, at: submittedAt, startedAt, submittedAt, timeTakenSec, timeRemainingSec, submissionType,
        prompt: currentPrompt, code: ev.code, feedback: ev.feedback, strengths: ev.strengths, weaknesses: ev.weaknesses,
        suggestions: ev.suggestions, rubric: ev.promptRubric,
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

  // "I don't know this one" — pause on the current problem and move straight
  // to the next. Nothing is scored; the timer and auto-saved draft for this
  // attempt are discarded and the in-progress marker cleared, so it isn't
  // counted as attempted or left mid-timer.
  function skipProblem() {
    if (busyRef.current) return;
    const inst = instanceRef.current;
    if (inst && timerKeyRef.current) {
      clearTimer(candidate.id, timerKeyRef.current);
      clearDraft(candidate.id, timerKeyRef.current);
      const updated = {
        ...candidate,
        inProgress: (candidate.inProgress || []).filter((ip) => ip.problemId !== inst.problem.id),
      };
      setCandidate(updated);
      DB.saveCandidate(updated);
    }
    setInstanceIdx((i) => i + 1);
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
        <CountdownTimer remainingSec={remainingSec} totalSec={assignment.timeLimitMinutes * 60} />
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
              </div>
            ) : (
              <>
                <textarea
                  value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={running}
                  placeholder="Instruct the AI how to solve this. Assign it a role, state the goal, give context, name constraints and edge cases, and specify the exact output format. The more precisely you write this, the more correct the generated code will be."
                  style={{ flex: 1, resize: "none", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 14, color: COLORS.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, lineHeight: 1.6, outline: "none" }}
                />
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <button
                    onClick={skipProblem} disabled={running}
                    title="Move on to the next problem without answering this one"
                    style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: running ? COLORS.muted : COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12.5, cursor: running ? "not-allowed" : "pointer" }}
                  >
                    <SkipForward size={14} />I don't know — skip
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
              {(() => {
                const v = promptVerdict(summary.promptScore);
                const map = { teal: COLORS.teal, gold: COLORS.gold, rose: COLORS.rose };
                const c = map[v.tone];
                return (
                  <div style={{ marginBottom: 16, background: COLORS.bg, border: `1px solid ${c}`, borderLeft: `4px solid ${c}`, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: c }}>{v.label}</span>
                      <span style={{ fontSize: 12, color: COLORS.muted }}>Prompt score {summary.promptScore}/100</span>
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 5, lineHeight: 1.5 }}>{v.blurb}</div>
                  </div>
                );
              })()}
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
              <div style={{ marginTop: 14, display: "grid", gap: 4, fontSize: 11, color: COLORS.muted, fontFamily: "'JetBrains Mono', monospace" }}>
                <div>Started {fmtDate(summary.startedAt)} · Submitted {fmtDate(summary.submittedAt)}</div>
                <div>
                  Time taken {formatClock(summary.timeTakenSec)}
                  {summary.timeRemainingSec != null ? ` · ${formatClock(summary.timeRemainingSec)} remaining` : ""}
                  {" · "}{summary.submissionType === "auto" ? "Auto-submitted after timeout" : "Manual submission"}
                </div>
              </div>
              {advanceMessage && (
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, color: COLORS.gold, fontSize: 12.5, fontWeight: 600 }}>
                  <ArrowRight size={14} />{advanceMessage}
                </div>
              )}
              {scores && !advanceMessage && (
                attemptsRemaining > 0 ? (
                  <button
                    onClick={() => beginAttempt(instance, candidate)}
                    style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, background: COLORS.panelAlt, color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 12.5, cursor: "pointer" }}
                  >
                    <RotateCcw size={13} />Try Again ({attemptsRemaining} attempt{attemptsRemaining === 1 ? "" : "s"} left)
                  </button>
                ) : (
                  <div style={{ marginTop: 12, fontSize: 11.5, color: COLORS.muted }}>No attempts remaining for this problem.</div>
                )
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
              <div style={label(COLORS.rose)}>{scores.promptEngineeringScore < 60 ? "Why This Prompt Is Weak" : "Weaknesses"}</div>
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
              <div style={label()}>Prompt Engineering Breakdown</div>
              <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {rubric.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 10 }}>
                    {r.met ? <Check size={14} color={COLORS.teal} style={{ marginTop: 2, flexShrink: 0 }} /> : <X size={14} color={COLORS.rose} style={{ marginTop: 2, flexShrink: 0 }} />}
                    <div>
                      <div style={{ fontSize: 12.5 }}>{r.criterion}</div>
                      {r.note && <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 2 }}>{r.note}</div>}
                    </div>
                  </div>
                ))}
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
