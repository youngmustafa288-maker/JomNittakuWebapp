-- Store coach public profile settings in the canonical coach row.
alter table public.coaches
  add column if not exists slug text not null default '',
  add column if not exists role text not null default 'Table Tennis Coach',
  add column if not exists bio text not null default '',
  add column if not exists links jsonb not null default '[]'::jsonb;

update public.coaches
set slug = regexp_replace(
  regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g'),
  '(^-+|-+$)', '', 'g'
)
where slug = '';

alter table public.coaches
  drop constraint if exists coaches_links_array_check;

alter table public.coaches
  add constraint coaches_links_array_check check (jsonb_typeof(links) = 'array');

create index if not exists coaches_slug_idx on public.coaches (slug);

grant update on public.coaches to authenticated;

drop policy if exists coaches_self_update on public.coaches;
create policy coaches_self_update on public.coaches
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists coaches_admin_update on public.coaches;
create policy coaches_admin_update on public.coaches
for update to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
