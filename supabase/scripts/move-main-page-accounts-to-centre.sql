-- Move every account on the main JomNittaku page into one centre.
-- 1. Create the centre in the dev account first (e.g. "JomNittaku").
-- 2. Change 'jomnittaku' below to that centre's link name
--    (the part after /centre/ in its login link).
-- 3. Run STEP 1 to see who will move. Then run STEP 2.
-- Accounts that already belong to a centre, and dev/admin accounts, are not moved.

-- STEP 1: preview who will move
select c.name, c.email
from public.coaches c
join auth.users u on u.id = c.id
where c.centre_id is null
  and not exists (select 1 from public.centre_memberships m where m.user_id = c.id)
  and coalesce(u.raw_app_meta_data ->> 'role', '') not in ('dev', 'admin', 'centre_admin')
order by c.name;

-- STEP 2: move them (run this whole block)
do $$
declare
  target_slug text := 'jomnittaku';   -- <-- change this
  target record;
  moved int;
begin
  select id, name into target from public.centres where slug = target_slug;
  if not found then
    raise exception 'No centre with link name "%". Create it in the dev account first.', target_slug;
  end if;

  -- Accounts to move
  create temp table moving on commit drop as
  select c.id
  from public.coaches c
  join auth.users u on u.id = c.id
  where c.centre_id is null
    and not exists (select 1 from public.centre_memberships m where m.user_id = c.id)
    and coalesce(u.raw_app_meta_data ->> 'role', '') not in ('dev', 'admin', 'centre_admin');

  select count(*) into moved from moving;

  -- Join the centre as coaches
  insert into public.centre_memberships (centre_id, user_id, role)
  select target.id, id, 'coach' from moving
  on conflict do nothing;

  -- Coach profiles
  update public.coaches c
     set centre_id = target.id,
         branch = case when c.branch in ('', 'Unassigned', 'Centre') then target.name else c.branch end,
         branch_address = case when c.branch_address in ('', 'Unassigned', 'Centre') then target.name else c.branch_address end
   where c.id in (select id from moving);

  -- Their students and reports
  update public.students set centre_id = target.id
   where centre_id is null and coach_id in (select id from moving);
  update public.reports set centre_id = target.id
   where centre_id is null and coach_id in (select id from moving);

  -- Main page settings and saved data -> the centre (only if the centre has none yet)
  insert into public.dashboard_state (id, payload)
  select 'centre:' || target.id, payload
    from public.dashboard_state
   where id = 'dashboard'
  on conflict (id) do nothing;

  raise notice 'Moved % accounts into %', moved, target.name;
end
$$;

-- OPTIONAL: make one account the centre admin (change the email)
-- update public.centre_memberships m set role = 'centre_admin'
--   from auth.users u
--  where u.id = m.user_id and lower(u.email) = lower('you@example.com');
