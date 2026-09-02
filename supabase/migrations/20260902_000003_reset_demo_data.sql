-- Remove the old demo records. New accounts start with an empty dashboard.
delete from public.reports;
delete from public.students;
delete from public.coaches;
delete from public.dashboard_state;
