-- supabase/migrations/0001_init.sql
create extension if not exists pgcrypto;

create table books (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  total_pages integer not null,
  exam_date date not null,
  target_read_count integer not null default 3,
  current_read_count integer not null default 1,
  current_page integer not null default 1,
  created_at timestamptz not null default now()
);

create table book_pages (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  page_num integer not null,
  content text not null,
  unique (book_id, page_num)
);

create table reference_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  page_num integer not null,
  content text not null,
  unique (name, page_num)
);

create table study_progress (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  date date not null,
  read_count integer not null,
  start_page integer not null,
  end_page integer not null,
  completed boolean not null default false,
  unique (book_id, date)
);

create table daily_sessions (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  essay_book_id uuid references books(id),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create type question_type as enum ('grammar', 'vocab', 'reading', 'theory', 'essay');

create table questions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id) on delete cascade,
  session_id uuid not null references daily_sessions(id) on delete cascade,
  type question_type not null,
  source_page integer not null,
  prompt text not null,
  choices jsonb,
  correct_answer text not null,
  used_reference boolean not null default false,
  created_at timestamptz not null default now()
);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  user_answer text,
  is_correct boolean,
  explanation text,
  korean_draft text,
  chinese_answer text,
  content_score integer,
  chinese_score integer,
  ai_feedback text,
  created_at timestamptz not null default now()
);

create table category_stats (
  id uuid primary key default gen_random_uuid(),
  type question_type not null unique,
  correct_count integer not null default 0,
  total_count integer not null default 0
);

create table vocab_of_the_day (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  word_zh text not null,
  pinyin text not null,
  meaning_ko text not null,
  example_zh text not null,
  example_ko text not null,
  created_at timestamptz not null default now()
);
