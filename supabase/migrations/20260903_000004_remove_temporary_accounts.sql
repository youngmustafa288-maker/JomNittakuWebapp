-- Remove temporary accounts created for setup verification.
delete from auth.users
where lower(email) in (
  'jomnittaku.admin.20260902@example.com',
  'jomnittaku.coach.20260902@example.com'
);
