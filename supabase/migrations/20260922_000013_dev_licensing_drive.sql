-- Privileged Dev licensing and centre-owned Google Drive metadata.
create extension if not exists pgcrypto;

create table if not exists public.centres (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.centre_memberships (
  centre_id uuid not null references public.centres(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('centre_admin', 'coach')),
  created_at timestamptz not null default now(),
  primary key (centre_id, user_id)
);

create table if not exists public.centre_licences (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid not null references public.centres(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked', 'expired')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.activation_keys (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid references public.centres(id) on delete cascade,
  key_hash text not null unique,
  generated_by uuid not null references auth.users(id),
  generated_at timestamptz not null default now(),
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.drive_connections (
  centre_id uuid primary key references public.centres(id) on delete cascade,
  google_account_email text not null,
  root_folder_id text not null,
  root_folder_name text not null,
  root_folder_url text not null,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected', 'connecting', 'error', 'disconnected')),
  last_error text,
  last_successful_sync_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drive_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  centre_id uuid not null references public.centres(id) on delete cascade,
  kind text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  centre_id uuid references public.centres(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.coaches add column if not exists centre_id uuid references public.centres(id) on delete set null;
alter table public.students add column if not exists centre_id uuid references public.centres(id) on delete set null;
alter table public.reports add column if not exists centre_id uuid references public.centres(id) on delete set null;

create index if not exists centre_memberships_user_idx on public.centre_memberships(user_id);
create index if not exists licences_centre_expiry_idx on public.centre_licences(centre_id, expires_at desc);
create index if not exists activation_keys_centre_idx on public.activation_keys(centre_id, generated_at desc);
create index if not exists drive_sync_jobs_centre_idx on public.drive_sync_jobs(centre_id, created_at desc);
create index if not exists audit_logs_centre_idx on public.audit_logs(centre_id, created_at desc);

create or replace function public.is_dev()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'dev' $$;

create or replace function public.is_centre_member(target_centre uuid, allowed_roles text[] default array['centre_admin','coach'])
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_dev() or exists (
    select 1 from public.centre_memberships m
    where m.centre_id = target_centre and m.user_id = auth.uid() and m.role = any(allowed_roles)
  )
$$;

create or replace function public.has_active_licence(target_centre uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.centres c
    join public.centre_licences l on l.centre_id = c.id
    where c.id = target_centre and c.status = 'active' and l.status = 'active'
      and now() >= l.starts_at and now() < l.expires_at
  )
$$;

alter table public.centres enable row level security;
alter table public.centre_memberships enable row level security;
alter table public.centre_licences enable row level security;
alter table public.activation_keys enable row level security;
alter table public.drive_connections enable row level security;
alter table public.drive_sync_jobs enable row level security;
alter table public.audit_logs enable row level security;

grant select on public.centres, public.centre_memberships, public.centre_licences, public.drive_connections, public.drive_sync_jobs to authenticated;
grant insert, update on public.drive_connections, public.drive_sync_jobs to authenticated;
grant select, insert, update, delete on public.centres, public.centre_memberships, public.centre_licences, public.activation_keys, public.audit_logs to service_role;
grant select, insert, update, delete on public.drive_connections, public.drive_sync_jobs to service_role;

create policy centres_read on public.centres for select to authenticated using (public.is_dev() or public.is_centre_member(id));
create policy memberships_read on public.centre_memberships for select to authenticated using (public.is_dev() or user_id = auth.uid() or public.is_centre_member(centre_id, array['centre_admin']));
create policy licences_read on public.centre_licences for select to authenticated using (public.is_dev() or public.is_centre_member(centre_id));
create policy drive_read on public.drive_connections for select to authenticated using (public.is_centre_member(centre_id));
create policy drive_admin_write on public.drive_connections for all to authenticated using (public.is_dev() or public.is_centre_member(centre_id, array['centre_admin'])) with check (public.is_dev() or public.is_centre_member(centre_id, array['centre_admin']));
create policy sync_read on public.drive_sync_jobs for select to authenticated using (public.is_centre_member(centre_id));
create policy sync_admin_write on public.drive_sync_jobs for insert to authenticated with check (public.is_dev() or public.is_centre_member(centre_id, array['centre_admin']));
create policy audit_dev_read on public.audit_logs for select to authenticated using (public.is_dev());

create or replace function public.audit_event(target_centre uuid, event_action text, event_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public
as $$ begin insert into public.audit_logs(actor_id, centre_id, action, metadata) values (auth.uid(), target_centre, event_action, event_metadata); end; $$;
revoke execute on function public.audit_event(uuid, text, jsonb) from public, anon;

drop trigger if exists set_centres_updated_at on public.centres;
create trigger set_centres_updated_at before update on public.centres for each row execute function public.set_updated_at();
drop trigger if exists set_drive_connections_updated_at on public.drive_connections;
create trigger set_drive_connections_updated_at before update on public.drive_connections for each row execute function public.set_updated_at();
