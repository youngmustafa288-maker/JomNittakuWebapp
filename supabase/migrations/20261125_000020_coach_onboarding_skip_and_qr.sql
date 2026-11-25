-- Setup guide v2: a QR step was added (now 7 steps: 0-6) and coaches can
-- skip steps. Skipped steps are listed in onboarding_skipped so the
-- dashboard can remind the coach about them.

alter table public.coaches
  add column if not exists onboarding_skipped text[] not null default '{}';

alter table public.coaches
  drop constraint if exists coaches_onboarding_step_range;
alter table public.coaches
  add constraint coaches_onboarding_step_range check (onboarding_step between 0 and 6);

alter table public.coaches
  drop constraint if exists coaches_onboarding_skipped_values;
alter table public.coaches
  add constraint coaches_onboarding_skipped_values
  check (onboarding_skipped <@ array['profile', 'drive', 'design', 'qr', 'students']::text[]);

grant update (onboarding_skipped) on public.coaches to authenticated;
