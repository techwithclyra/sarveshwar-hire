// NOTE: client-side gate only — these credentials ship in the JS bundle.
// Fine for a prototype/demo; production must authenticate on the server.
export const ADMIN_USERNAME = "admin";
export const ADMIN_PASSWORD = "DIVYA2025";

export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
