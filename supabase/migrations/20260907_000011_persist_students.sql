-- Store student records in the canonical students table for authenticated users.
grant select, insert, update, delete on public.students to authenticated;

drop policy if exists students_admin_read on public.students;
create policy students_admin_read on public.students
for select to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists students_coach_read on public.students;
create policy students_coach_read on public.students
for select to authenticated
using ((select auth.uid()) = coach_id);

drop policy if exists students_admin_insert on public.students;
create policy students_admin_insert on public.students
for insert to authenticated
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists students_coach_insert on public.students;
create policy students_coach_insert on public.students
for insert to authenticated
with check ((select auth.uid()) = coach_id);

drop policy if exists students_admin_update on public.students;
create policy students_admin_update on public.students
for update to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists students_coach_update on public.students;
create policy students_coach_update on public.students
for update to authenticated
using ((select auth.uid()) = coach_id)
with check ((select auth.uid()) = coach_id);

drop policy if exists students_admin_delete on public.students;
create policy students_admin_delete on public.students
for delete to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists students_coach_delete on public.students;
create policy students_coach_delete on public.students
for delete to authenticated
using ((select auth.uid()) = coach_id);
