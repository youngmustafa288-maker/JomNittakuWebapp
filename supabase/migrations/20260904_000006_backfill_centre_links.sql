-- Move any previously saved public links out of the private dashboard payload.
insert into public.centre_links (id, links)
select 'centre', coalesce(payload -> 'centreProfile' -> 'links', '[]'::jsonb)
from public.dashboard_state
where id = 'dashboard'
  and jsonb_typeof(payload -> 'centreProfile' -> 'links') = 'array'
on conflict (id) do update
set links = excluded.links
where public.centre_links.links = '[]'::jsonb;

-- dashboard_state contains academy data and is authenticated-only at the policy layer.
-- Remove the stale anonymous table grants as defense in depth and to keep the API contract explicit.
revoke select, insert, update, delete on public.dashboard_state from anon;
