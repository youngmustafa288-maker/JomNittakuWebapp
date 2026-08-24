create extension if not exists pgcrypto;

create table if not exists public.coaches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branch text not null,
  centre_contact text not null default '',
  email text not null default '',
  phone text not null default '',
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  photo text not null default '',
  branch_address text not null default '',
  reports_generated_this_month integer not null default 0,
  reports_total integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  name text not null,
  lessons integer not null default 0,
  parent_hp text not null default '',
  photo text not null default '',
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  age text not null default '',
  centre text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  student_id uuid not null references public.students(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  lesson_label text not null,
  lesson_number integer not null check (lesson_number > 0),
  session_date date not null,
  session_time time not null,
  status text not null default 'Pending' check (status in ('Sent', 'Pending', 'Draft')),
  generated_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists students_coach_id_idx on public.students (coach_id);
create index if not exists reports_coach_id_idx on public.reports (coach_id);
create index if not exists reports_student_id_idx on public.reports (student_id);
create index if not exists reports_session_date_idx on public.reports (session_date desc, session_time desc);
create index if not exists reports_coach_date_idx on public.reports (coach_id, session_date desc, session_time desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_coaches_updated_at on public.coaches;
create trigger set_coaches_updated_at
before update on public.coaches
for each row execute function public.set_updated_at();

drop trigger if exists set_students_updated_at on public.students;
create trigger set_students_updated_at
before update on public.students
for each row execute function public.set_updated_at();

drop trigger if exists set_reports_updated_at on public.reports;
create trigger set_reports_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

alter table public.coaches enable row level security;
alter table public.students enable row level security;
alter table public.reports enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.coaches to service_role;
grant select, insert, update, delete on table public.students to service_role;
grant select, insert, update, delete on table public.reports to service_role;

revoke all on schema public from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
revoke all on all sequences in schema public from anon, authenticated;
grant usage, select on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;

create table if not exists public.dashboard_state (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_dashboard_state_updated_at on public.dashboard_state;
create trigger set_dashboard_state_updated_at
before update on public.dashboard_state
for each row execute function public.set_updated_at();

alter table public.dashboard_state enable row level security;
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.dashboard_state to anon, authenticated;
grant select, insert, update, delete on public.dashboard_state to service_role;

drop policy if exists dashboard_state_read on public.dashboard_state;
create policy dashboard_state_read on public.dashboard_state
for select to anon, authenticated
using (true);

drop policy if exists dashboard_state_insert on public.dashboard_state;
create policy dashboard_state_insert on public.dashboard_state
for insert to anon, authenticated
with check (true);

drop policy if exists dashboard_state_update on public.dashboard_state;
create policy dashboard_state_update on public.dashboard_state
for update to anon, authenticated
using (true)
with check (true);

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dashboard_state'
  ) then
    alter publication supabase_realtime add table public.dashboard_state;
  end if;
end;
$$;

insert into public.dashboard_state (id, payload)
values ('dashboard', '{
  "dataVersion": 3,
  "auth": { "role": "admin", "coachId": "coach-1" },
  "ui": { "page": "overview", "avatarMenuOpen": false, "reportViewId": null, "adminToast": "" },
  "adminProfile": { "fullName": "Dao Sports Method Admin", "photo": "" }
}'::jsonb)
on conflict (id) do nothing;

insert into public.coaches (id, name, branch, centre_contact, email, phone, status, photo, branch_address, reports_generated_this_month, reports_total)
values
  ('11111111-1111-1111-1111-111111111111', 'Coach Ahmad', 'Dao Sports Method HQ', '+60 12-300 9101', 'ahmad@daosportsmethod.com', '+60 12-300 9101', 'Active', '', 'Dao Sports Method HQ', 18, 24),
  ('22222222-2222-2222-2222-222222222222', 'Coach Mei', 'Cheras Centre', '+60 12-300 9102', 'mei@daosportsmethod.com', '+60 12-300 9102', 'Active', '', 'Cheras Centre', 16, 19),
  ('33333333-3333-3333-3333-333333333333', 'Coach Raj', 'Puchong Branch', '+60 12-300 9103', 'raj@daosportsmethod.com', '+60 12-300 9103', 'Active', '', 'Puchong Branch', 13, 17),
  ('44444444-4444-4444-4444-444444444444', 'Coach Daniel', 'Kepong Branch', '+60 12-300 9104', 'daniel@daosportsmethod.com', '+60 12-300 9104', 'Active', '', 'Kepong Branch', 11, 14),
  ('55555555-5555-5555-5555-555555555555', 'Coach Alicia', 'Setapak Branch', '+60 12-300 9105', 'alicia@daosportsmethod.com', '+60 12-300 9105', 'Active', '', 'Setapak Branch', 10, 12),
  ('66666666-6666-6666-6666-666666666666', 'Coach Marcus', 'Damansara Branch', '+60 12-300 9106', 'marcus@daosportsmethod.com', '+60 12-300 9106', 'Active', '', 'Damansara Branch', 8, 10),
  ('77777777-7777-7777-7777-777777777777', 'Coach Jasmine', 'Serdang Branch', '+60 12-300 9107', 'jasmine@daosportsmethod.com', '+60 12-300 9107', 'Active', '', 'Serdang Branch', 8, 9),
  ('88888888-8888-8888-8888-888888888888', 'Coach Kevin', 'Subang Centre', '+60 12-300 9108', 'kevin@daosportsmethod.com', '+60 12-300 9108', 'Active', '', 'Subang Centre', 7, 8),
  ('99999999-9999-9999-9999-999999999999', 'Coach Nadia', 'Shah Alam Branch', '+60 12-300 9109', 'nadia@daosportsmethod.com', '+60 12-300 9109', 'Active', '', 'Shah Alam Branch', 6, 7)
on conflict (id) do update set
  name = excluded.name,
  branch = excluded.branch,
  centre_contact = excluded.centre_contact,
  email = excluded.email,
  phone = excluded.phone,
  status = excluded.status,
  photo = excluded.photo,
  branch_address = excluded.branch_address,
  reports_generated_this_month = excluded.reports_generated_this_month,
  reports_total = excluded.reports_total;

with student_seed as (
  select
    gs,
    case
      when gs = 1 then '11111111-1111-1111-1111-111111111111'
      when gs = 2 then '22222222-2222-2222-2222-222222222222'
      when gs = 3 then '11111111-1111-1111-1111-111111111111'
      when gs = 4 then '22222222-2222-2222-2222-222222222222'
      when gs = 5 then '33333333-3333-3333-3333-333333333333'
      when gs = 6 then '33333333-3333-3333-3333-333333333333'
      else (array[
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        '44444444-4444-4444-4444-444444444444',
        '55555555-5555-5555-5555-555555555555',
        '66666666-6666-6666-6666-666666666666',
        '77777777-7777-7777-7777-777777777777',
        '88888888-8888-8888-8888-888888888888',
        '99999999-9999-9999-9999-999999999999'
      ])[((gs - 1) % 9) + 1]
    end as coach_id,
    case
      when gs = 1 then 'Amir Hakim'
      when gs = 2 then 'Sarah Aisyah'
      when gs = 3 then 'Daniel Lim'
      when gs = 4 then 'Nur Farhana'
      when gs = 5 then 'Izzat Mazlan'
      when gs = 6 then 'Razif Zain'
      else
        (array['Adam','Aiden','Aisha','Brandon','Caleb','Chloe','Darren','Dylan','Ethan','Evelyn','Faris','Grace','Hana','Haziq','Ian','Iris','Jason','Jia','Kai','Kendra','Lucas','Megan','Nathan','Nina','Owen','Peyton','Qisya','Ray','Sean','Sofia','Talia','Uma','Victor','Wendy','Yusuf','Zara'])[((gs - 7) % 36) + 1]
        || ' ' ||
        (array['Tan','Lim','Goh','Lee','Wong','Ng','Chew','Chan','Low','Teh','Ong','Lai','Yap','Khoo'])[((gs - 7) % 14) + 1]
    end as name,
    case
      when gs = 1 then 7
      when gs = 2 then 4
      when gs = 3 then 12
      when gs = 4 then 2
      when gs = 5 then 9
      when gs = 6 then 5
      else 6 + ((gs - 1) % 12)
    end as lessons,
    format('+60 17-%s', lpad((3000000 + gs * 173)::text, 7, '0')) as parent_hp
  from generate_series(1, 84) as gs
)
insert into public.students (id, coach_id, name, lessons, parent_hp, photo, status, age, centre)
select
  gen_random_uuid(),
  ss.coach_id::uuid,
  ss.name,
  ss.lessons,
  ss.parent_hp,
  '',
  'Active',
  '',
  c.branch
from student_seed ss
join public.coaches c on c.id = ss.coach_id::uuid
where not exists (
  select 1 from public.students s where s.name = ss.name and s.coach_id = ss.coach_id::uuid
);

with report_seed as (
  select * from (values
    ('0001AMIR7', 'Amir Hakim', 'Coach Ahmad', 7, date '2026-07-05', time '09:14', 'Sent'),
    ('0002SARA4', 'Sarah Aisyah', 'Coach Mei', 4, date '2026-07-05', time '09:08', 'Sent'),
    ('0003DANI12', 'Daniel Lim', 'Coach Ahmad', 12, date '2026-07-05', time '10:30', 'Sent'),
    ('0004NURF2', 'Nur Farhana', 'Coach Mei', 2, date '2026-07-04', time '17:33', 'Pending'),
    ('0005IZZA9', 'Izzat Mazlan', 'Coach Raj', 9, date '2026-07-04', time '16:15', 'Sent'),
    ('0006RAZI5', 'Razif Zain', 'Coach Raj', 5, date '2026-07-03', time '14:00', 'Sent')
  ) as t(ref, student_name, coach_name, lesson_number, session_date, session_time, status)
)
insert into public.reports (id, ref, student_id, coach_id, lesson_label, lesson_number, session_date, session_time, status, generated_at, summary)
select
  gen_random_uuid(),
  rs.ref,
  s.id,
  c.id,
  (array['Footwork Fundamentals','Forehand Drive','Backhand Control','Serve Precision','Spin Reading','Match Strategy','Transition Drill','Consistency Circuit'])[((rs.lesson_number - 1) % 8) + 1],
  rs.lesson_number,
  rs.session_date,
  rs.session_time,
  rs.status,
  (rs.session_date::text || 'T' || rs.session_time::text || ':00')::timestamptz,
  jsonb_build_object(
    'whatTaught', 'Warm-up rhythm drill' || E'\n' || 'Foot placement correction',
    'beforeCoaching', 'Timing slipped when recovering wide' || E'\n' || 'Contact point drifted behind the body',
    'afterTraining', 'Recovered balance faster after side-step drills' || E'\n' || 'Produced cleaner forehand contact under pressure',
    'nextLesson', 'Add serve variation to open rallies' || E'\n' || 'Reinforce compact backswing in transitions',
    'remarks', 'Solid overall session. Continue reinforcing stable body position during transition drills.'
  )
from report_seed rs
join public.students s on s.name = rs.student_name
join public.coaches c on c.name = rs.coach_name
where not exists (
  select 1 from public.reports r where r.ref = rs.ref
);
