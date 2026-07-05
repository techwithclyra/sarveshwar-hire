import { API_BASE, ADMIN_PASSWORD } from "../config/constants.js";

// Students live behind the backend (see backend/students.js) rather than
// being readable directly from Supabase — the table holds password hashes,
// so unlike problems/candidates it isn't exposed to the anon key at all.
// (Student login itself no longer uses this table — see StudentIntake.jsx —
// but the Admin Students tab still manages this roster via these endpoints.)
async function adminRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_PASSWORD, ...(options.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const StudentsAPI = {
  list: () => adminRequest("/api/admin/students"),
  create: (student) => adminRequest("/api/admin/students", { method: "POST", body: JSON.stringify(student) }),
  update: (id, fields) => adminRequest(`/api/admin/students/${id}`, { method: "PUT", body: JSON.stringify(fields) }),
  remove: (id) => adminRequest(`/api/admin/students/${id}`, { method: "DELETE" }),
};
