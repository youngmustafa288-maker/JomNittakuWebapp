-- Lets a student be deleted without losing their name on past reports.
-- Deleted students are hidden from every list in the app.
alter table public.students drop constraint if exists students_status_check;
alter table public.students
  add constraint students_status_check check (status in ('Active', 'Inactive', 'Deleted'));
