-- Store per-coach certificate overlay layout preferences.
alter table public.coaches
  add column if not exists report_layout jsonb not null default '{}'::jsonb;

alter table public.coaches
  drop constraint if exists coaches_report_layout_object_check;

alter table public.coaches
  add constraint coaches_report_layout_object_check
  check (jsonb_typeof(report_layout) = 'object');
