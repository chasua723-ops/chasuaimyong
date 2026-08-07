-- supabase/migrations/0002_essay_concept_grading.sql
alter table attempts add column concept_score integer;
alter table attempts add column concept_checklist jsonb;
alter table attempts add column grammar_corrections jsonb;

alter table questions alter column session_id drop not null;
