-- Keep the generated activation code available to the privileged dev console
-- while preserving the hash used for redemption checks.
alter table public.activation_keys
  add column if not exists key_value text;

-- Centre-specific branding is public through the centre login/link page.
alter table public.centres
  add column if not exists logo_url text not null default '';
