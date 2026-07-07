// REAL execution — sandboxed Web Worker with timeout
const WORKER_SRC = `
self.onmessage = function (ev) {
  var code = ev.data.code, input = ev.data.input, logs = [];
  var origLog = console.log;
  console.log = function () { logs.push(Array.prototype.slice.call(arguments).map(String).join(' ')); };
  try {
    var factory = new Function(code + '\\nreturn (typeof solve === "function") ? solve : null;');
    var solve = factory();
    if (!solve) { self.postMessage({ ok: false, error: "No solve(input) function was defined" }); return; }
    var out = solve(input);
    console.log = origLog;
    var result;
    if ((out === undefined || out === null || out === "") && logs.length) result = logs.join('\\n');
    else result = (out === undefined || out === null) ? "" : String(out);
    self.postMessage({ ok: true, output: result });
  } catch (err) { self.postMessage({ ok: false, error: String((err && err.message) || err) }); }
};
`;

export function runInWorker(code, input, timeoutMs) {
  return new Promise((resolve) => {
    let worker, url, done = false;
    const finish = (res) => {
      if (done) return; done = true; clearTimeout(timer);
      try { worker && worker.terminate(); } catch (e) {}
      try { url && URL.revokeObjectURL(url); } catch (e) {}
      resolve(res);
    };
    const timer = setTimeout(() => finish({ ok: false, error: "Timed out (possible infinite loop)" }), timeoutMs);
    try {
      url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
      worker = new Worker(url);
      worker.onmessage = (e) => finish(e.data);
      worker.onerror = (e) => finish({ ok: false, error: e.message || "Worker error" });
      worker.postMessage({ code, input });
    } catch (e) { finish({ ok: false, error: "Sandbox unavailable: " + (e.message || e) }); }
  });
}

export function outputsMatch(actual, expected, unordered) {
  const norm = (s) => String(s).replace(/\r/g, "").trim();
  let a = norm(actual), e = norm(expected);
  if (unordered) { const t = (x) => x.split(/\s+/).filter(Boolean).sort().join(" "); return t(a) === t(e); }
  return a === e;
}

// Strict comparison used for the "Output Accuracy" score, independent of the
// problem's `unordered` flag — rewards exact formatting, not just correct logic.
export function outputsMatchExact(actual, expected) {
  const norm = (s) => String(s).replace(/\r/g, "").trim();
  return norm(actual) === norm(expected);
}
