// NOTE: client-side gate only — these credentials ship in the JS bundle.
// Fine for a prototype/demo; production must authenticate on the server.
export const ADMIN_USERNAME = "admin";
export const ADMIN_PASSWORD = "DIVYA2025";

// In a production build the backend is served from the same origin under
// /api (see ../../../vercel.json), so the base is empty and fetches are
// relative. In dev it points at the local Express server. An explicit
// VITE_API_BASE overrides both (e.g. to target a backend hosted elsewhere).
export const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "http://localhost:3001" : "");

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
