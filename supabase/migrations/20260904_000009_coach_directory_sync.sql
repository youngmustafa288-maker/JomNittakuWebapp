-- Keep the Admin coaches directory backed by the canonical coaches table.
grant select on public.coaches to authenticated;

-- Repair the known email/password coach account if its profile row was lost.
insert into public.coaches (id, name, branch, email, phone, centre_contact, branch_address)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''), 'Coach'),
  'Unassigned',
  lower(u.email),
  '',
  '',
  'Unassigned'
from auth.users u
where lower(u.email) = 'jomnittakucoach@example.com'
on conflict (id) do update set email = excluded.email;

drop policy if exists coaches_admin_read on public.coaches;
create policy coaches_admin_read on public.coaches
for select to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists coaches_self_read on public.coaches;
create policy coaches_self_read on public.coaches
for select to authenticated
using ((select auth.uid()) = id);

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'coaches'
  ) then
    alter publication supabase_realtime add table public.coaches;
  end if;
end;
$$;
