-- Guided setup for new coaches.
-- onboarding_step: the last step the coach reached (0-5).
-- onboarding_completed_at: null means the coach must finish the guide.

alter table public.coaches
  add column if not exists onboarding_step smallint not null default 0,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.coaches
  drop constraint if exists coaches_onboarding_step_range;
alter table public.coaches
  add constraint coaches_onboarding_step_range check (onboarding_step between 0 and 5);

-- Existing coaches already use the app, so they skip the guide.
-- Only coaches created after this migration see it.
update public.coaches
set onboarding_completed_at = coalesce(created_at, now()),
    onboarding_step = 5
where onboarding_completed_at is null;

-- Coaches may save their own progress (row access is still limited by
-- the existing coaches_self_update policy).
grant update (onboarding_step, onboarding_completed_at) on public.coaches to authenticated;
