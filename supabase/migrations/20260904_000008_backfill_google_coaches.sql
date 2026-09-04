-- Ensure Google accounts created before the provisioning trigger are usable.
-- The auth UUID remains the coach UUID so row-level ownership is preserved.
insert into public.coaches (id, name, branch, email, phone, centre_contact, branch_address)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(u.email, 'Coach'), '@', 1),
    'Coach'
  ),
  'Unassigned',
  coalesce(u.email, ''),
  '',
  '',
  'Unassigned'
from auth.users u
where (
  u.raw_app_meta_data ->> 'provider' = 'google'
  or exists (
    select 1
    from auth.identities i
    where i.user_id = u.id
      and i.provider = 'google'
  )
)
and not exists (
  select 1 from public.coaches c where c.id = u.id
);

-- Reassert provisioning for future Google sign-ins in case the earlier
-- migration was not applied to the project yet.
create or replace function public.handle_new_coach_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
begin
  display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(new.email, 'Coach'), '@', 1),
    'Coach'
  );

  insert into public.coaches (id, name, branch, email, phone, centre_contact, branch_address)
  values (new.id, display_name, 'Unassigned', coalesce(new.email, ''), '', '', 'Unassigned')
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_coach_auth_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_coach on auth.users;
create trigger on_auth_user_created_coach
after insert on auth.users
for each row execute function public.handle_new_coach_auth_user();

grant select on public.coaches to authenticated;
drop policy if exists coaches_self_read on public.coaches;
create policy coaches_self_read on public.coaches
for select to authenticated
using ((select auth.uid()) = id);
