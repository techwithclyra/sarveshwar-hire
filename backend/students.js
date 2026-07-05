import bcrypt from "bcryptjs";
import { supabaseAdmin } from "./supabaseClient.js";

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    college: row.college,
    department: row.department,
    batch: row.batch || "",
    username: row.username,
    active: !!row.active,
    createdAt: row.created_at,
  };
}

export async function listStudents() {
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin.from("students").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(mapRow);
}

export async function createStudent({ name, email, college, department, batch, username, password }) {
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured (set SUPABASE_SERVICE_ROLE_KEY in backend/.env)");
  const password_hash = await bcrypt.hash(password, 10);
  const row = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name, email, college, department, batch: batch || null, username, password_hash,
    active: true, created_at: Date.now(),
  };
  const { error } = await supabaseAdmin.from("students").insert(row);
  if (error) throw new Error(error.message);
  return mapRow(row);
}

export async function updateStudent(id, fields) {
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured (set SUPABASE_SERVICE_ROLE_KEY in backend/.env)");
  const update = {};
  if (fields.name != null) update.name = fields.name;
  if (fields.email != null) update.email = fields.email;
  if (fields.college != null) update.college = fields.college;
  if (fields.department != null) update.department = fields.department;
  if (fields.batch != null) update.batch = fields.batch || null;
  if (fields.username != null) update.username = fields.username;
  if (fields.active != null) update.active = !!fields.active;
  if (fields.password) update.password_hash = await bcrypt.hash(fields.password, 10);

  const { data, error } = await supabaseAdmin.from("students").update(update).eq("id", id).select().maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Student not found");
  return mapRow(data);
}

export async function deleteStudent(id) {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin.from("students").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function verifyLogin(username, password) {
  if (!supabaseAdmin) throw new Error("Supabase service role is not configured (set SUPABASE_SERVICE_ROLE_KEY in backend/.env)");
  const { data, error } = await supabaseAdmin.from("students").select("*").eq("username", username).maybeSingle();
  if (error || !data || !data.active) return null;
  const ok = await bcrypt.compare(password, data.password_hash);
  if (!ok) return null;
  return mapRow(data);
}
