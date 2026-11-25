-- One account belongs to one centre.
-- The unique index stops an account from being added to a second centre.
-- If some accounts already belong to more than one centre, the index is not
-- created yet: fix those accounts first (see the query in the notice), then
-- run this migration again.

do $$
begin
  if exists (
    select user_id from public.centre_memberships group by user_id having count(*) > 1
  ) then
    raise notice 'Some accounts belong to more than one centre. Find them with: select user_id, array_agg(centre_id) from public.centre_memberships group by user_id having count(*) > 1;';
  else
    create unique index if not exists centre_memberships_one_centre_per_user
      on public.centre_memberships (user_id);
  end if;
end
$$;
