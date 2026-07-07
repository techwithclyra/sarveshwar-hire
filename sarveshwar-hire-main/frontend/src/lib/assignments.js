// Pure resolution logic shared by the student workspace (which problems can
// this student see?) and the admin dashboard (which students match this
// assignment, and where do they stand?). Both target and problem selection
// are evaluated live against current data rather than frozen at creation
// time, except "specific"/random-drawn problem lists, which are fixed once
// chosen.

export function isAssignmentOpen(assignment) {
  if (!assignment.active) return false;
  const now = Date.now();
  if (assignment.startAt && now < assignment.startAt) return false;
  if (assignment.endAt && now > assignment.endAt) return false;
  return true;
}

export function assignmentAppliesToStudent(assignment, student) {
  if (assignment.targetType === "individual") {
    return assignment.targetStudentIds.includes(student.id);
  }
  if (assignment.targetCollege && assignment.targetCollege !== student.college) return false;
  if (assignment.targetDepartment && assignment.targetDepartment !== student.department) return false;
  if (assignment.targetBatch && assignment.targetBatch !== student.batch) return false;
  return true;
}

export function resolveAssignmentProblems(assignment, allProblems) {
  if (assignment.problemMode === "specific") {
    return allProblems.filter((p) => assignment.problemIds.includes(p.id));
  }
  if (!assignment.difficultyFilter || assignment.difficultyFilter === "Mixed") return allProblems;
  return allProblems.filter((p) => p.difficulty === assignment.difficultyFilter);
}

// All (problem, assignment) instances a given student can currently work on,
// across every open assignment that targets them. If the same problem is
// reachable via more than one assignment, the first match wins.
export function resolveAssignedInstances(assignments, allProblems, student) {
  const instances = [];
  const seen = new Set();
  for (const a of assignments) {
    if (!isAssignmentOpen(a) || !assignmentAppliesToStudent(a, student)) continue;
    for (const problem of resolveAssignmentProblems(a, allProblems)) {
      if (seen.has(problem.id)) continue;
      seen.add(problem.id);
      instances.push({ problem, assignment: a });
    }
  }
  return instances;
}

export function matchingStudents(assignment, students) {
  return students.filter((s) => assignmentAppliesToStudent(assignment, s));
}

export function randomProblemIds(pool, count) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((p) => p.id);
}

// Best-effort status for the admin progress view. "In progress" from a live
// timer relies on the candidate's `inProgress` marker (written by the
// workspace when it starts a timed problem) — there's no push/websocket
// layer here, so the admin dashboard polls rather than getting true
// real-time updates.
export function studentAssignmentStatus(assignment, resolvedProblems, candidate) {
  const total = resolvedProblems.length;
  if (!candidate) return { status: "not_started", completed: 0, total, remainingSec: null };

  const resolvedIds = new Set(resolvedProblems.map((p) => p.id));
  const attemptedIds = new Set((candidate.attempts || []).filter((a) => resolvedIds.has(a.problemId)).map((a) => a.problemId));
  const completed = attemptedIds.size;
  if (total > 0 && completed >= total) return { status: "completed", completed, total, remainingSec: null };

  const activeTimer = (candidate.inProgress || []).find(
    (ip) => ip.assignmentId === assignment.id && resolvedIds.has(ip.problemId) && !attemptedIds.has(ip.problemId)
  );
  if (activeTimer) {
    const limitSec = assignment.timeLimitMinutes * 60;
    const remainingSec = Math.max(0, limitSec - (Date.now() - activeTimer.startedAt) / 1000);
    return { status: "in_progress", completed, total, remainingSec };
  }
  if (completed > 0) return { status: "in_progress", completed, total, remainingSec: null };
  return { status: "not_started", completed, total, remainingSec: null };
}
