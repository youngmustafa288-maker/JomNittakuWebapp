-- Profile images are public for report and public coach profile rendering.
insert into storage.buckets (id, name, public)
values ('profile-images', 'profile-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists profile_images_read on storage.objects;
create policy profile_images_read on storage.objects
for select
to anon, authenticated
using (bucket_id = 'profile-images');

drop policy if exists profile_images_insert on storage.objects;
create policy profile_images_insert on storage.objects
for insert
to authenticated
with check (bucket_id = 'profile-images');

drop policy if exists profile_images_update on storage.objects;
create policy profile_images_update on storage.objects
for update
to authenticated
using (bucket_id = 'profile-images')
with check (bucket_id = 'profile-images');

drop policy if exists profile_images_delete on storage.objects;
create policy profile_images_delete on storage.objects
for delete
to authenticated
using (bucket_id = 'profile-images');

-- The dashboard is no longer usable anonymously because it contains academy data.
drop policy if exists dashboard_state_read on public.dashboard_state;
create policy dashboard_state_read on public.dashboard_state
for select to authenticated
using (true);

drop policy if exists dashboard_state_insert on public.dashboard_state;
create policy dashboard_state_insert on public.dashboard_state
for insert to authenticated
with check (true);

drop policy if exists dashboard_state_update on public.dashboard_state;
create policy dashboard_state_update on public.dashboard_state
for update to authenticated
using (true)
with check (true);
