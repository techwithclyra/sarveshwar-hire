import { API_BASE } from "../config/constants.js";

// Public student authentication — no admin key. The backend holds the
// password hashes (see backend/students.js); the browser only ever sends
// plaintext over HTTPS and receives back the student profile (no hash).
async function post(path, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }
  // Guard against a non-JSON error page (e.g. a 502 from the host) so the
  // student never sees a raw "Unexpected token < in JSON" parse error.
  let data;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

export const AuthAPI = {
  // `identifier` may be an email or an admin-assigned username.
  login: (identifier, password) => post("/api/auth/login", { username: identifier, password }),
  signup: (profile) => post("/api/auth/signup", profile),
  // Exchanges a verified Supabase Google session for a student profile.
  // Pass college/department on the second call to finish first-time signup.
  google: (payload) => post("/api/auth/google", payload),
};
