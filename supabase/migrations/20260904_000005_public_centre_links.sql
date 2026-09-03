-- Store only public centre links separately from the private dashboard payload.
create table if not exists public.centre_links (
  id text primary key,
  links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint centre_links_id_check check (id = 'centre'),
  constraint centre_links_links_array_check check (jsonb_typeof(links) = 'array')
);

drop trigger if exists set_centre_links_updated_at on public.centre_links;
create trigger set_centre_links_updated_at
before update on public.centre_links
for each row execute function public.set_updated_at();

alter table public.centre_links enable row level security;
grant select on public.centre_links to anon, authenticated;
grant insert, update on public.centre_links to authenticated;

drop policy if exists centre_links_public_read on public.centre_links;
create policy centre_links_public_read on public.centre_links
for select to anon, authenticated
using (id = 'centre');

drop policy if exists centre_links_authenticated_insert on public.centre_links;
create policy centre_links_authenticated_insert on public.centre_links
for insert to authenticated
with check (id = 'centre');

drop policy if exists centre_links_authenticated_update on public.centre_links;
create policy centre_links_authenticated_update on public.centre_links
for update to authenticated
using (id = 'centre')
with check (id = 'centre');

insert into public.centre_links (id, links)
values ('centre', '[]'::jsonb)
on conflict (id) do nothing;
