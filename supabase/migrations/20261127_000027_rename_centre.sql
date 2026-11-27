-- Lets the dev account rename a centre.
-- The centre's link (slug) stays the same, so links already shared keep working.
-- Coaches whose branch was the old centre name get the new name too.

create or replace function public.rename_centre(target_centre uuid, new_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := left(btrim(coalesce(new_name, '')), 80);
  old_name text;
begin
  if not public.is_dev() then
    raise exception 'Dev role required' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a centre name' using errcode = '22023';
  end if;

  select c.name into old_name from public.centres c where c.id = target_centre;
  if not found then
    raise exception 'Centre not found' using errcode = 'P0002';
  end if;

  update public.centres set name = clean_name, updated_at = now() where id = target_centre;

  update public.coaches
     set branch = case when branch = old_name then clean_name else branch end,
         branch_address = case when branch_address = old_name then clean_name else branch_address end
   where centre_id = target_centre
     and (branch = old_name or branch_address = old_name);

  insert into public.audit_logs (actor_id, centre_id, action, metadata)
  values (auth.uid(), target_centre, 'centre.renamed', jsonb_build_object('from', old_name, 'to', clean_name));

  return clean_name;
end;
$$;

revoke all on function public.rename_centre(uuid, text) from public, anon;
grant execute on function public.rename_centre(uuid, text) to authenticated;
