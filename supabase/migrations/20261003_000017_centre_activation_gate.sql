-- A centre remains locked until one of its generated activation codes is redeemed.
alter table public.centres
  add column if not exists activated_at timestamptz;
