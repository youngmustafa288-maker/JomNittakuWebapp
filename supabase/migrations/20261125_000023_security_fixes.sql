-- Security fixes from the app review.

-- 1. The shared centre data row (dashboard_state) no longer carries people
--    data. Remove the student and coach lists already stored there, so
--    coaches can't see other coaches' students (and parent phone numbers).
update public.dashboard_state
set payload = payload - 'coaches' - 'students' - 'devCentres'
where payload ? 'coaches' or payload ? 'students' or payload ? 'devCentres';

-- 2. Profile photos and logos: anyone signed in may upload a new file, but
--    only the person who uploaded a file can replace or delete it.
drop policy if exists profile_images_update on storage.objects;
create policy profile_images_update on storage.objects
  for update to authenticated
  using (bucket_id = 'profile-images' and (owner = auth.uid() or owner_id = auth.uid()::text))
  with check (bucket_id = 'profile-images' and (owner = auth.uid() or owner_id = auth.uid()::text));

drop policy if exists profile_images_delete on storage.objects;
create policy profile_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'profile-images' and (owner = auth.uid() or owner_id = auth.uid()::text));

-- 3. Coaches and centre admins can edit profile fields, but not which centre
--    a coach belongs to, their role or status. (A column-level revoke does
--    not override a table-level grant, so the table grant is replaced with a
--    list of editable columns.)
revoke update on public.coaches from authenticated;
grant update (
  name, branch, centre_contact, branch_address, email, phone, slug, bio, photo,
  links, report_layout, onboarding_step, onboarding_completed_at, onboarding_skipped
) on public.coaches to authenticated;

-- 4. The encrypted Google Drive key is only for the server. Centre members can
--    still see the connection details, but not the key.
revoke select on public.drive_connections from authenticated;
grant select (
  centre_id, google_account_email, root_folder_id, root_folder_name, root_folder_url,
  token_expires_at, status, last_error, last_successful_sync_at, connected_at, updated_at
) on public.drive_connections to authenticated;
