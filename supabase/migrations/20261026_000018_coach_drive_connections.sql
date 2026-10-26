-- Each coach authorizes and owns a separate Google Drive connection.
-- OAuth secrets and refresh tokens are accessible only to the service-role Edge Function.
create table if not exists public.coach_drive_connections (
  coach_id uuid primary key references auth.users(id) on delete cascade,
  centre_id uuid not null references public.centres(id) on delete cascade,
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
create index if not exists coach_drive_connections_centre_idx
  on public.coach_drive_connections(centre_id, status);
alter table public.coach_drive_connections enable row level security;
revoke all on public.coach_drive_connections from public, anon, authenticated;
grant select, insert, update, delete on public.coach_drive_connections to service_role;

-- OAuth state is single-use, time limited, and tied to the initiating user.
create table if not exists public.coach_drive_oauth_states (
  nonce_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  centre_id uuid not null references public.centres(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists coach_drive_oauth_states_expiry_idx on public.coach_drive_oauth_states(expires_at);
alter table public.coach_drive_oauth_states enable row level security;
revoke all on public.coach_drive_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on public.coach_drive_oauth_states to service_role;

-- Keep existing centre Drive connections unchanged. This migration does not move
-- private files from a centre's Drive into a coach's Google account.
drop trigger if exists set_coach_drive_connections_updated_at on public.coach_drive_connections;
create trigger set_coach_drive_connections_updated_at before update on public.coach_drive_connections
  for each row execute function public.set_updated_at();
