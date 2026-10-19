-- Coaches may update their own profile and certificate layout, but not role,
-- centre membership, status, or report counters.
revoke update on public.coaches from authenticated;
grant update (
  name,
  branch,
  centre_contact,
  email,
  phone,
  photo,
  branch_address,
  slug,
  role,
  bio,
  links,
  report_layout
) on public.coaches to authenticated;

drop policy if exists coaches_self_update on public.coaches;
create policy coaches_self_update on public.coaches
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
