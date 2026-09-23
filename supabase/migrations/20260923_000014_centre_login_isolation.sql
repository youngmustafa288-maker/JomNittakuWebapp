alter table public.centres
  add column if not exists slug text;

update public.centres
set slug = coalesce(
  nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''),
  'centre-' || left(id::text, 8)
)
where slug is null or slug = '';

create unique index if not exists centres_slug_key on public.centres (slug);
alter table public.centres alter column slug set not null;

create or replace function public.centre_id_from_dashboard_state(target_id text)
returns uuid language plpgsql immutable
set search_path = public
as $$
begin
  if target_id !~ '^centre:[0-9a-fA-F-]{36}$' then
    return null;
  end if;
  return substring(target_id from 8)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

grant select (id, name, slug, status) on public.centres to anon;
grant select, insert, update on public.dashboard_state to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, update on public.coaches to authenticated;
grant select, insert, update, delete on public.reports to authenticated;
drop policy if exists centres_public_login_lookup on public.centres;
create policy centres_public_login_lookup on public.centres
  for select to anon using (status = 'active');

-- Replace legacy broad policies. RLS policies are additive, so leaving the
-- earlier admin/coach policies in place would allow cross-tenant reads.
drop policy if exists students_admin_read on public.students;
drop policy if exists students_coach_read on public.students;
drop policy if exists students_admin_insert on public.students;
drop policy if exists students_coach_insert on public.students;
drop policy if exists students_admin_update on public.students;
drop policy if exists students_coach_update on public.students;
drop policy if exists students_admin_delete on public.students;
drop policy if exists students_coach_delete on public.students;
drop policy if exists coaches_admin_read on public.coaches;
drop policy if exists coaches_self_update on public.coaches;
drop policy if exists coaches_admin_update on public.coaches;

drop policy if exists centre_links_authenticated_insert on public.centre_links;
drop policy if exists centre_links_authenticated_update on public.centre_links;
create policy centre_links_admin_insert on public.centre_links
  for insert to authenticated
  with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'dev'));
create policy centre_links_admin_update on public.centre_links
  for update to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'dev'))
  with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'dev'));

-- Keep the legacy JomNittaku workspace separate, and give each centre a
-- dedicated dashboard_state row protected by its centre membership.
drop policy if exists dashboard_state_read on public.dashboard_state;
drop policy if exists dashboard_state_insert on public.dashboard_state;
drop policy if exists dashboard_state_update on public.dashboard_state;

create policy dashboard_state_read on public.dashboard_state
  for select to authenticated
  using (
    (id = 'dashboard' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'dev'))
    or (public.centre_id_from_dashboard_state(id) is not null and public.is_centre_member(public.centre_id_from_dashboard_state(id)))
  );

create policy dashboard_state_insert on public.dashboard_state
  for insert to authenticated
  with check (
    (id = 'dashboard' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'dev'))
    or (public.centre_id_from_dashboard_state(id) is not null and public.is_centre_member(public.centre_id_from_dashboard_state(id)))
  );

create policy dashboard_state_update on public.dashboard_state
  for update to authenticated
  using (
    (id = 'dashboard' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'dev'))
    or (public.centre_id_from_dashboard_state(id) is not null and public.is_centre_member(public.centre_id_from_dashboard_state(id)))
  )
  with check (
    (id = 'dashboard' and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'dev'))
    or (public.centre_id_from_dashboard_state(id) is not null and public.is_centre_member(public.centre_id_from_dashboard_state(id)))
  );

drop policy if exists coaches_centre_read on public.coaches;
create policy coaches_centre_read on public.coaches
  for select to authenticated
  using (centre_id is not null and public.is_centre_member(centre_id, array['centre_admin']));

drop policy if exists coaches_self_read on public.coaches;
create policy coaches_self_read on public.coaches
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists coaches_centre_update on public.coaches;
create policy coaches_centre_update on public.coaches
  for update to authenticated
  using (centre_id is not null and public.is_centre_member(centre_id, array['centre_admin']))
  with check (centre_id is not null and public.is_centre_member(centre_id, array['centre_admin']));

create policy coaches_legacy_admin_access on public.coaches
  for all to authenticated
  using (centre_id is null and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'dev'))
  with check (centre_id is null and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'dev'));

drop policy if exists students_centre_access on public.students;
create policy students_centre_access on public.students
  for all to authenticated
  using (centre_id is not null and public.is_centre_member(centre_id, array['centre_admin']))
  with check (centre_id is not null and public.is_centre_member(centre_id, array['centre_admin']));

drop policy if exists students_centre_coach_access on public.students;
create policy students_centre_coach_access on public.students
  for all to authenticated
  using (coach_id = (select auth.uid()) and public.is_centre_member(centre_id))
  with check (coach_id = (select auth.uid()) and public.is_centre_member(centre_id));

create policy students_legacy_admin_access on public.students
  for all to authenticated
  using (centre_id is null and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'dev'))
  with check (centre_id is null and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'dev'));

drop policy if exists reports_centre_access on public.reports;
create policy reports_centre_access on public.reports
  for all to authenticated
  using (centre_id is not null and public.is_centre_member(centre_id, array['centre_admin']))
  with check (centre_id is not null and public.is_centre_member(centre_id, array['centre_admin']));

create policy reports_centre_coach_access on public.reports
  for all to authenticated
  using (coach_id = (select auth.uid()) and public.is_centre_member(centre_id))
  with check (coach_id = (select auth.uid()) and public.is_centre_member(centre_id));

create policy reports_legacy_admin_access on public.reports
  for all to authenticated
  using (centre_id is null and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'dev'))
  with check (centre_id is null and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'dev'));
