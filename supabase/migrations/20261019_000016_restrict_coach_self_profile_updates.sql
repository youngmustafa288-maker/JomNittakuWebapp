-- Keep coach self-updates limited to editable profile and certificate layout fields.
revoke update (role) on public.coaches from authenticated;
