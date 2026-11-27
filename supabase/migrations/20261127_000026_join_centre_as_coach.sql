-- New coaches sign up with Google from their centre's link.
-- This database function lets a brand-new Google account join that centre as
-- a coach. The app uses it when the dev-console server function can't do it.
-- Rules (same as the server function):
--   * Google accounts only.
--   * Staff accounts (dev, admin, centre_admin) never join as a coach.
--   * An account that already belongs to a centre is never moved: opening
--     another centre's link is refused with 'other_centre'.

create or replace function public.join_centre_as_coach(target_centre uuid)
returns table (centre_id uuid, user_id uuid, role text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  account record;
  target record;
  home record;
  display_name text;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;

  select u.email, u.raw_app_meta_data as app_meta, u.raw_user_meta_data as user_meta
    into account
    from auth.users u
   where u.id = uid;

  if not (
    coalesce(account.app_meta ->> 'provider', '') = 'google'
    or coalesce(account.app_meta -> 'providers', '[]'::jsonb) ? 'google'
    or exists (select 1 from auth.identities i where i.user_id = uid and i.provider = 'google')
  ) then
    raise exception 'Google sign-in is required' using errcode = '42501';
  end if;

  if coalesce(account.app_meta ->> 'role', '') in ('dev', 'admin', 'centre_admin') then
    raise exception 'has_role: staff accounts cannot join as a coach' using errcode = '42501';
  end if;

  select c.id, c.name, c.status into target
    from public.centres c
   where c.id = target_centre;
  if not found or target.status <> 'active' then
    raise exception 'This centre is unavailable' using errcode = 'P0002';
  end if;

  -- Already in this centre: nothing to do.
  if exists (select 1 from public.centre_memberships m where m.user_id = uid and m.centre_id = target_centre) then
    return query
      select m.centre_id, m.user_id, m.role
        from public.centre_memberships m
       where m.user_id = uid and m.centre_id = target_centre;
    return;
  end if;

  -- Belongs to another centre: refuse, and say which one.
  select c.name, c.slug into home
    from public.centre_memberships m
    join public.centres c on c.id = m.centre_id
   where m.user_id = uid
   limit 1;
  if found then
    raise exception 'other_centre: This account belongs to another centre'
      using errcode = '42501',
            hint = json_build_object('name', coalesce(home.name, ''), 'slug', coalesce(home.slug, ''))::text;
  end if;

  insert into public.centre_memberships (centre_id, user_id, role)
  values (target_centre, uid, 'coach');

  display_name := coalesce(
    nullif(account.user_meta ->> 'full_name', ''),
    nullif(account.user_meta ->> 'name', ''),
    split_part(coalesce(account.email, 'Coach'), '@', 1),
    'Coach'
  );

  insert into public.coaches (id, name, branch, branch_address, email, centre_id)
  values (uid, display_name, target.name, target.name, coalesce(account.email, ''), target_centre)
  on conflict (id) do update
    set centre_id = excluded.centre_id,
        branch = case when public.coaches.branch in ('', 'Unassigned', 'Centre') then excluded.branch else public.coaches.branch end,
        branch_address = case when public.coaches.branch_address in ('', 'Unassigned', 'Centre') then excluded.branch_address else public.coaches.branch_address end
    where public.coaches.centre_id is null or public.coaches.centre_id = excluded.centre_id;

  insert into public.audit_logs (actor_id, centre_id, action, metadata)
  values (uid, target_centre, 'membership.google-joined', '{}'::jsonb);

  return query select target_centre, uid, 'coach'::text;
end;
$$;

revoke all on function public.join_centre_as_coach(uuid) from public, anon;
grant execute on function public.join_centre_as_coach(uuid) to authenticated;
