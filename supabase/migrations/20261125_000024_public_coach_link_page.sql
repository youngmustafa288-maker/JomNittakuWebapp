-- Coach link page (the page the certificate QR opens).
-- 1. Every coach gets a unique link name (slug).
-- 2. Anyone (parents, not signed in) can open the page, which shows only
--    public details: name, role, bio, photo, links and centre name/logo.

create or replace function public.slugify_text(value text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(trim(both '-' from regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g')), ''),
    'coach'
  );
$$;

-- Fill empty slugs and make duplicates unique (the first coach keeps the
-- plain name, later ones get part of their ID added).
with ranked as (
  select
    id,
    public.slugify_text(case when coalesce(slug, '') <> '' then slug else name end) as base,
    row_number() over (
      partition by public.slugify_text(case when coalesce(slug, '') <> '' then slug else name end)
      order by created_at, id
    ) as n
  from public.coaches
)
update public.coaches c
set slug = case when r.n = 1 then r.base else r.base || '-' || left(c.id::text, 6) end
from ranked r
where r.id = c.id
  and c.slug is distinct from (case when r.n = 1 then r.base else r.base || '-' || left(c.id::text, 6) end);

create unique index if not exists coaches_slug_unique on public.coaches (slug);

-- New coaches (and coaches whose slug is cleared) get a unique slug.
create or replace function public.set_coach_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
begin
  if coalesce(new.slug, '') <> '' then
    new.slug := public.slugify_text(new.slug);
    return new;
  end if;
  base := public.slugify_text(new.name);
  if exists (select 1 from public.coaches where slug = base and id <> new.id) then
    new.slug := base || '-' || left(new.id::text, 6);
  else
    new.slug := base;
  end if;
  return new;
end;
$$;

drop trigger if exists set_coach_slug on public.coaches;
create trigger set_coach_slug
before insert or update of slug on public.coaches
for each row execute function public.set_coach_slug();

-- Public link page data. Never returns email, phone or other private fields.
create or replace function public.get_public_coach_page(target_slug text)
returns table (name text, role text, bio text, photo text, links jsonb, centre_name text, centre_logo text)
language sql
stable
security definer
set search_path = public
as $$
  select c.name, c.role, c.bio, c.photo, c.links, ce.name, ce.logo_url
  from public.coaches c
  left join public.centres ce on ce.id = c.centre_id and ce.status = 'active'
  where c.slug = lower(target_slug) and coalesce(c.status, 'Active') = 'Active'
  limit 1;
$$;

revoke all on function public.get_public_coach_page(text) from public;
grant execute on function public.get_public_coach_page(text) to anon, authenticated;
