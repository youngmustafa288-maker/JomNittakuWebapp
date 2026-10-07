alter table public.centres
  add column if not exists sport text not null default 'Table tennis';
