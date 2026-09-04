-- Every newly created OAuth user is provisioned as a coach.
-- The auth UUID is reused as the coach UUID so ownership is unambiguous.
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
