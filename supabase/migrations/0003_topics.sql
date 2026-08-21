-- supabase/migrations/0003_topics.sql
-- Run this manually in the Supabase SQL Editor before running the topic ingestion script
-- (Task 6) or exercising the /study feature against a real database. This repo has no
-- migration runner — schema changes are never applied automatically.
create table topics (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  parent_id uuid references topics(id) on delete cascade,
  name text not null,
  start_page integer not null,
  end_page integer not null,
  explanation text,
  created_at timestamptz not null default now()
);
