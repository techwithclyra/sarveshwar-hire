-- Run this in the Supabase SQL Editor for project wtcisxvqtrfnrsoateku
-- (Dashboard -> SQL Editor -> New query -> paste -> Run).
--
-- Safe to run multiple times: every CREATE TABLE uses IF NOT EXISTS, every
-- column that was ever added after a table's initial version is applied via
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS (so older tables catch up), and
-- every CREATE POLICY is preceded by a matching DROP POLICY IF EXISTS.

-- ---------------------------------------------------------------------------
-- candidates
-- ---------------------------------------------------------------------------
create table if not exists public.candidates (
  id text primary key,
  name text not null,
  dept text not null,
  college text not null,
  created_at bigint not null,
  attempts jsonb not null default '[]'::jsonb,
  in_progress jsonb not null default '[]'::jsonb
);

-- Added after the initial version of this table (timed-assessment /
-- assignment features) — safe no-op if already present.
alter table public.candidates add column if not exists in_progress jsonb not null default '[]'::jsonb;

alter table public.candidates enable row level security;

-- Prototype-grade policy: anyone with the publishable key can read/write.
-- This matches the rest of the app (client-side admin password gate) and
-- is fine for a demo/internal tool, but should be tightened before any
-- real hiring data goes through it (e.g. restrict writes to service role
-- and only allow inserts, not arbitrary updates/deletes, from the client).
drop policy if exists "public read" on public.candidates;
drop policy if exists "public insert" on public.candidates;
drop policy if exists "public update" on public.candidates;
drop policy if exists "public delete" on public.candidates;

create policy "public read" on public.candidates for select using (true);
create policy "public insert" on public.candidates for insert with check (true);
create policy "public update" on public.candidates for update using (true);
create policy "public delete" on public.candidates for delete using (true);

-- ---------------------------------------------------------------------------
-- problems
-- ---------------------------------------------------------------------------
-- Previously a hardcoded array in backend/problems.js; now lives here so the
-- Admin Panel can add/edit/remove problems without a code change or
-- redeploy. Same prototype-grade trust model as candidates.
create table if not exists public.problems (
  id text primary key,
  title text not null,
  difficulty text not null,
  statement text not null,
  constraints text not null,
  input_format text not null,
  output_format text not null,
  ideal_traits jsonb not null default '[]'::jsonb,
  test_cases jsonb not null default '[]'::jsonb,
  unordered boolean not null default false,
  time_limit_minutes integer not null default 3,
  timer_enabled boolean not null default true,
  created_at bigint not null
);

-- Added after the initial version of this table (timed-assessment feature)
-- — safe no-op if already present.
alter table public.problems add column if not exists time_limit_minutes integer not null default 3;
alter table public.problems add column if not exists timer_enabled boolean not null default true;

alter table public.problems enable row level security;

drop policy if exists "public read" on public.problems;
drop policy if exists "public insert" on public.problems;
drop policy if exists "public update" on public.problems;
drop policy if exists "public delete" on public.problems;

create policy "public read" on public.problems for select using (true);
create policy "public insert" on public.problems for insert with check (true);
create policy "public update" on public.problems for update using (true);
create policy "public delete" on public.problems for delete using (true);

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------
-- Unlike every other table here, this one is NOT publicly readable/writable
-- — it holds password hashes, so leaking it would let anyone dump every
-- student's hash and crack it offline. RLS is enabled with NO policies
-- below, which denies all access via the anon/publishable key. The backend
-- talks to this table using the Supabase SERVICE ROLE key
-- (SUPABASE_SERVICE_ROLE_KEY in backend/.env), which bypasses RLS entirely,
-- and is the only thing that ever sees password_hash.
create table if not exists public.students (
  id text primary key,
  name text not null,
  email text not null unique,
  college text not null,
  department text not null,
  batch text,
  username text not null unique,
  password_hash text not null,
  active boolean not null default true,
  created_at bigint not null
);

alter table public.students enable row level security;
-- Intentionally no policies: the anon/publishable key gets zero access.
-- If a stray policy was ever added by hand, drop it so the table stays locked:
drop policy if exists "public read" on public.students;
drop policy if exists "public insert" on public.students;
drop policy if exists "public update" on public.students;
drop policy if exists "public delete" on public.students;

-- The candidates table is keyed by the logged-in student's id (rather than
-- an anonymous uid() generated by a self-serve intake form), and a row is
-- created/loaded on first login. Structure is unchanged.

-- ---------------------------------------------------------------------------
-- assignments
-- ---------------------------------------------------------------------------
-- No credentials in here, so this follows the same prototype-grade public
-- policy as candidates/problems.
create table if not exists public.assignments (
  id text primary key,
  title text not null,
  target_type text not null, -- 'individual' | 'group'
  target_student_ids jsonb not null default '[]'::jsonb,
  target_college text,
  target_department text,
  target_batch text,
  problem_mode text not null, -- 'specific' | 'difficulty'
  problem_ids jsonb not null default '[]'::jsonb,
  difficulty_filter text, -- 'Easy' | 'Medium' | 'Hard' | 'Mixed'
  time_limit_minutes integer not null default 3,
  start_at bigint,
  end_at bigint,
  max_attempts integer not null default 1,
  allow_revisit boolean not null default true,
  active boolean not null default true,
  created_at bigint not null
);

alter table public.assignments enable row level security;

drop policy if exists "public read" on public.assignments;
drop policy if exists "public insert" on public.assignments;
drop policy if exists "public update" on public.assignments;
drop policy if exists "public delete" on public.assignments;

create policy "public read" on public.assignments for select using (true);
create policy "public insert" on public.assignments for insert with check (true);
create policy "public update" on public.assignments for update using (true);
create policy "public delete" on public.assignments for delete using (true);
