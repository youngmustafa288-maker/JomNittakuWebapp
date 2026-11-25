-- Look up an active centre by its link (slug) for the login page.
-- Works the same whether the visitor is signed in or not, and whichever
-- centre they belong to, so a refresh never shows "Centre login unavailable"
-- because of who is signed in. Returns only what the login page needs.

create or replace function public.get_centre_by_slug(target_slug text)
returns table (id uuid, name text, slug text, sport text, status text, logo_url text, activated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.slug, c.sport, c.status, c.logo_url, c.activated_at
  from public.centres c
  where c.slug = target_slug and c.status = 'active'
  limit 1;
$$;

revoke all on function public.get_centre_by_slug(text) from public;
grant execute on function public.get_centre_by_slug(text) to anon, authenticated;
