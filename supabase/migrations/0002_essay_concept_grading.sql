-- supabase/migrations/0002_essay_concept_grading.sql
-- Run this manually in the Supabase SQL Editor before deploying code that
-- depends on it (the essay-notebook feature). This repo has no migration
-- runner — schema changes are never applied automatically.
alter table attempts add column concept_score integer;
alter table attempts add column concept_checklist jsonb;
alter table attempts add column grammar_corrections jsonb;

alter table questions alter column session_id drop not null;
