-- AmritaCollab schema. Run once in Supabase SQL Editor (new project).
create table public.profiles(
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'student' check (role in ('student','lab','faculty')),
  name text not null, email text not null, dept text, year text,
  created_at timestamptz not null default now());

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- role is ALWAYS student on signup; staff are promoted via supabase/staff-setup.sql
  insert into profiles(id,name,email,dept,year) values(new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1)),
    new.email, new.raw_user_meta_data->>'dept', new.raw_user_meta_data->>'year');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.equipment(id bigint generated always as identity primary key, name text not null, category text, location text);
create table public.faculty(id bigint generated always as identity primary key, user_id uuid references public.profiles(id) on delete set null,
  name text not null, designation text, department text, qualification text, email text,
  interests text, background text, research text);

create function public.app_role() returns text language sql stable security definer set search_path=public as $$ select role from profiles where id=auth.uid() $$;
create function public.my_faculty_id() returns bigint language sql stable security definer set search_path=public as $$ select id from faculty where user_id=auth.uid() $$;
create function public.valid_slot(s text) returns boolean language sql immutable as $$
  select s = any(array['09:00-10:00','10:00-11:00','11:00-12:00','12:00-13:00','14:00-15:00','15:00-16:00','16:00-17:00']) $$;

create table public.notifications(id bigint generated always as identity primary key, user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null, body text, read boolean not null default false, created_at timestamptz not null default now());
create function public.notify(p_user uuid, p_subject text, p_body text) returns void language sql security definer set search_path=public as $$
  insert into notifications(user_id,subject,body) values(p_user,p_subject,p_body) $$;
revoke all on function public.notify(uuid,text,text) from public, anon, authenticated;

-- ============ Module 1: equipment ============
create table public.equipment_bookings(
  id bigint generated always as identity primary key,
  student_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  student_name text, student_email text, student_dept text,
  equipment_id bigint not null references public.equipment(id),
  purpose text not null check (char_length(purpose) between 1 and 400),
  day date not null, slot text not null,
  priority text, score int, reason text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  note text, created_at timestamptz not null default now());
create unique index one_accepted_equipment_slot on public.equipment_bookings(equipment_id,day,slot) where status='accepted';

create table public.mentor_requests(
  id bigint generated always as identity primary key,
  student_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  student_name text, student_email text, student_dept text,
  faculty_id bigint not null references public.faculty(id),
  title text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 1 and 600),
  day date not null, slot text not null,
  priority text, score int, reason text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  final_day date, final_slot text, note text, attachment_path text,
  created_at timestamptz not null default now());
create unique index one_accepted_faculty_slot on public.mentor_requests(faculty_id,final_day,final_slot) where status='accepted';

create function public.before_request_insert() returns trigger language plpgsql security definer set search_path=public as $$
declare p profiles;
begin
  select * into p from profiles where id=new.student_id;
  if p.role <> 'student' then raise exception 'Only students can make requests'; end if;
  new.student_name:=p.name; new.student_email:=p.email; new.student_dept:=p.dept; new.status:='pending';
  if new.day < current_date then raise exception 'That date is in the past'; end if;
  if extract(isodow from new.day) > 5 then raise exception 'Slots are Monday to Friday only'; end if;
  if not valid_slot(new.slot) then raise exception 'Invalid slot'; end if;
  if tg_table_name = 'equipment_bookings' then
    if exists(select 1 from equipment_bookings where equipment_id=new.equipment_id and day=new.day and slot=new.slot and status='accepted') then
      raise exception 'That slot is already booked'; end if;
  end if;
  return new;
end $$;
create trigger t_book_ins before insert on public.equipment_bookings for each row execute function public.before_request_insert();
create trigger t_ment_ins before insert on public.mentor_requests for each row execute function public.before_request_insert();

create function public.before_booking_update() returns trigger language plpgsql as $$
begin
  if old.status<>'pending' then raise exception 'Already decided'; end if;
  new.student_id:=old.student_id; new.equipment_id:=old.equipment_id; new.purpose:=old.purpose; new.day:=old.day; new.slot:=old.slot;
  new.priority:=old.priority; new.score:=old.score; new.reason:=old.reason; new.created_at:=old.created_at;
  new.student_name:=old.student_name; new.student_email:=old.student_email; new.student_dept:=old.student_dept;
  return new;
end $$;
create trigger t_book_upd before update on public.equipment_bookings for each row execute function public.before_booking_update();

create function public.before_mentor_update() returns trigger language plpgsql as $$
begin
  if old.status<>'pending' then raise exception 'Already decided'; end if;
  new.student_id:=old.student_id; new.faculty_id:=old.faculty_id; new.title:=old.title; new.description:=old.description; new.day:=old.day; new.slot:=old.slot;
  new.priority:=old.priority; new.score:=old.score; new.reason:=old.reason; new.created_at:=old.created_at; new.attachment_path:=old.attachment_path;
  new.student_name:=old.student_name; new.student_email:=old.student_email; new.student_dept:=old.student_dept;
  if new.status='accepted' then
    if new.final_day is null or new.final_day < current_date or extract(isodow from new.final_day)>5 or not valid_slot(new.final_slot) then
      raise exception 'Pick a valid future weekday and slot'; end if;
  else new.final_day:=null; new.final_slot:=null; end if;
  return new;
end $$;
create trigger t_ment_upd before update on public.mentor_requests for each row execute function public.before_mentor_update();

create function public.notify_decision() returns trigger language plpgsql security definer set search_path=public as $$
declare f faculty;
begin
  if new.status = old.status then return new; end if;
  if tg_table_name='equipment_bookings' then
    perform notify(new.student_id, 'Equipment request '||new.status,
      (select name from equipment where id=new.equipment_id)||' on '||new.day||' at '||new.slot||coalesce(E'\nNote: '||nullif(new.note,''),''));
  else
    select * into f from faculty where id=new.faculty_id;
    perform notify(new.student_id, 'Mentor request '||new.status||': '||new.title,
      case when new.status='accepted' then f.name||' accepted. Meeting: '||new.final_day||' at '||new.final_slot||E'\nContact: '||f.email
           else f.name||' could not take this request.' end||coalesce(E'\nNote: '||nullif(new.note,''),''));
  end if;
  return new;
end $$;
create trigger t_book_n after update on public.equipment_bookings for each row execute function public.notify_decision();
create trigger t_ment_n after update on public.mentor_requests for each row execute function public.notify_decision();

-- slot availability visible to students without exposing who booked
create function public.equipment_taken(p_from date,p_to date) returns table(id bigint,day date,slot text)
language sql stable security definer set search_path=public as $$
  select equipment_id, day, slot from equipment_bookings where status='accepted' and day between p_from and p_to $$;
create function public.faculty_taken(p_from date,p_to date) returns table(id bigint,day date,slot text)
language sql stable security definer set search_path=public as $$
  select faculty_id, final_day, final_slot from mentor_requests where status='accepted' and final_day between p_from and p_to $$;

-- ============ Module 3: teams ============
create table public.team_requests(
  id bigint generated always as identity primary key,
  creator_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  creator_name text, creator_dept text,
  title text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 1 and 600),
  created_at timestamptz not null default now());
create table public.team_roles(
  id bigint generated always as identity primary key,
  request_id bigint not null references public.team_requests(id) on delete cascade,
  dept text not null, specialization text not null check (char_length(specialization) between 1 and 80),
  filled_by uuid references public.profiles(id) on delete set null, filled_name text);

create function public.team_snap() returns trigger language plpgsql security definer set search_path=public as $$
declare p profiles;
begin select * into p from profiles where id=new.creator_id;
  if p.role<>'student' then raise exception 'Students only'; end if;
  new.creator_name:=p.name; new.creator_dept:=p.dept; return new; end $$;
create trigger t_team_snap before insert on public.team_requests for each row execute function public.team_snap();

create function public.accept_team_role(p_role bigint) returns void language plpgsql security definer set search_path=public as $$
declare r team_roles; t team_requests; me profiles; body text; m record;
begin
  select * into me from profiles where id=auth.uid();
  if me.role is distinct from 'student' then raise exception 'Students only'; end if;
  select * into r from team_roles where id=p_role; if not found then raise exception 'Role not found'; end if;
  select * into t from team_requests where id=r.request_id;
  if t.creator_id=me.id then raise exception 'You cannot accept your own request'; end if;
  if exists(select 1 from team_roles where request_id=r.request_id and filled_by=me.id) then raise exception 'You already joined this team'; end if;
  update team_roles set filled_by=me.id, filled_name=me.name where id=p_role and filled_by is null;
  if not found then raise exception 'Someone else just took that role'; end if;
  select 'Team: '||t.title||E'\n\nMembers:\n'||string_agg('- '||x.name||' <'||x.email||'> - '||x.role, E'\n') into body from team_roster(t.id) x;
  for m in select distinct u.email, u.id from (select creator_id as id from team_requests where id=t.id union select filled_by from team_roles where request_id=t.id and filled_by is not null) q join profiles u on u.id=q.id loop
    perform notify(m.id, 'Team '''||t.title||''': contact details', body);
  end loop;
end $$;

create function public.team_roster(p_req bigint) returns table(name text,email text,role text)
language sql stable security definer set search_path=public as $$
  select s.name, s.email, s.role from (
    select u.name, u.email, 'Team creator'::text as role, 0 as o from team_requests t join profiles u on u.id=t.creator_id where t.id=p_req
    union all
    select u.name, u.email, r.specialization||' ('||r.dept||')', r.id::int from team_roles r join profiles u on u.id=r.filled_by where r.request_id=p_req
  ) s
  where exists(select 1 from team_requests t where t.id=p_req and t.creator_id=auth.uid())
     or exists(select 1 from team_roles r where r.request_id=p_req and r.filled_by=auth.uid())
  order by s.o $$;

-- ============ Module 4: resources ============
create table public.resource_requests(
  id bigint generated always as identity primary key,
  creator_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  creator_name text,
  name text not null check (char_length(name) between 1 and 120),
  specs text check (char_length(specs) <= 400),
  mode text not null check (mode in ('rent','buy')),
  till_day date, expires_at date not null, image_path text,
  created_at timestamptz not null default now());
create table public.resource_offers(
  id bigint generated always as identity primary key,
  request_id bigint not null references public.resource_requests(id) on delete cascade,
  request_name text, mode text,
  offerer_id uuid not null references public.profiles(id) on delete cascade, offerer_name text, offerer_email text,
  requester_id uuid not null, requester_name text, requester_email text,
  expires_at date, created_at timestamptz not null default now(),
  unique(request_id, offerer_id));

create function public.res_snap() returns trigger language plpgsql security definer set search_path=public as $$
declare p profiles;
begin select * into p from profiles where id=new.creator_id;
  if p.role<>'student' then raise exception 'Students only'; end if;
  new.creator_name:=p.name;
  if new.mode='rent' then
    if new.till_day is null or new.till_day<current_date then raise exception 'Pick a valid till date'; end if;
    new.expires_at:=new.till_day;
  else new.till_day:=null; new.expires_at:=current_date+30; end if;
  return new; end $$;
create trigger t_res_snap before insert on public.resource_requests for each row execute function public.res_snap();

create function public.offer_resource(p_req bigint) returns void language plpgsql security definer set search_path=public as $$
declare r resource_requests; me profiles; c profiles;
begin
  select * into me from profiles where id=auth.uid();
  if me.role is distinct from 'student' then raise exception 'Students only'; end if;
  select * into r from resource_requests where id=p_req and expires_at>=current_date;
  if not found then raise exception 'That request has expired or was deleted'; end if;
  if r.creator_id=me.id then raise exception 'That is your own request'; end if;
  select * into c from profiles where id=r.creator_id;
  insert into resource_offers(request_id,request_name,mode,offerer_id,offerer_name,offerer_email,requester_id,requester_name,requester_email,expires_at)
    values(r.id,r.name,r.mode,me.id,me.name,me.email,c.id,c.name,c.email,r.expires_at);
  perform notify(c.id, 'Someone has '''||r.name||'''', me.name||' <'||me.email||'> says they have the resource you requested.');
  perform notify(me.id, 'You offered '''||r.name||'''', 'Requester: '||c.name||' <'||c.email||E'>\nResource: '||r.name||' ('||r.mode||')');
exception when unique_violation then raise exception 'You already offered this';
end $$;

-- ============ RLS ============
alter table profiles enable row level security; alter table equipment enable row level security; alter table faculty enable row level security;
alter table notifications enable row level security; alter table equipment_bookings enable row level security; alter table mentor_requests enable row level security;
alter table team_requests enable row level security; alter table team_roles enable row level security;
alter table resource_requests enable row level security; alter table resource_offers enable row level security;

create policy "own profile" on profiles for select to authenticated using (id=auth.uid());
create policy "read equipment" on equipment for select to authenticated using (true);
create policy "read faculty" on faculty for select to authenticated using (true);
create policy "own notifications" on notifications for select to authenticated using (user_id=auth.uid());
create policy "mark read" on notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

create policy "student sees own bookings" on equipment_bookings for select to authenticated using (student_id=auth.uid() or app_role()='lab');
create policy "student books" on equipment_bookings for insert to authenticated with check (student_id=auth.uid() and app_role()='student');
create policy "lab decides" on equipment_bookings for update to authenticated using (app_role()='lab') with check (app_role()='lab');

create policy "student sees own mentor reqs" on mentor_requests for select to authenticated using (student_id=auth.uid() or faculty_id=my_faculty_id());
create policy "student requests mentor" on mentor_requests for insert to authenticated with check (student_id=auth.uid() and app_role()='student');
create policy "faculty decides" on mentor_requests for update to authenticated using (faculty_id=my_faculty_id()) with check (faculty_id=my_faculty_id());

create policy "read teams" on team_requests for select to authenticated using (true);
create policy "create team" on team_requests for insert to authenticated with check (creator_id=auth.uid() and app_role()='student');
create policy "delete own team" on team_requests for delete to authenticated using (creator_id=auth.uid());
create policy "read roles" on team_roles for select to authenticated using (true);
create policy "add roles" on team_roles for insert to authenticated with check (exists(select 1 from team_requests t where t.id=request_id and t.creator_id=auth.uid()) and filled_by is null);

create policy "read live resources" on resource_requests for select to authenticated using (expires_at>=current_date);
create policy "create resource" on resource_requests for insert to authenticated with check (creator_id=auth.uid() and app_role()='student');
create policy "delete own resource" on resource_requests for delete to authenticated using (creator_id=auth.uid());
create policy "see own offers" on resource_offers for select to authenticated using (offerer_id=auth.uid() or requester_id=auth.uid());

grant execute on function public.equipment_taken, public.faculty_taken, public.team_roster, public.accept_team_role, public.offer_resource to authenticated;

-- ============ Storage ============
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('resource-images','resource-images',true,5242880,array['image/png','image/jpeg','image/webp']),
 ('mentor-files','mentor-files',false,10485760,array['application/pdf','image/png','image/jpeg','application/zip'])
on conflict (id) do nothing;
create policy "upload own resource image" on storage.objects for insert to authenticated with check (bucket_id='resource-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "delete own resource image" on storage.objects for delete to authenticated using (bucket_id='resource-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "upload own mentor file" on storage.objects for insert to authenticated with check (bucket_id='mentor-files' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "read mentor file" on storage.objects for select to authenticated using (bucket_id='mentor-files' and (
  (storage.foldername(name))[1]=auth.uid()::text
  or exists(select 1 from public.mentor_requests m where m.attachment_path=name and m.faculty_id=public.my_faculty_id())));

-- ============ Seed data ============
insert into public.equipment(name,category,location) values
('3D Printer - Ultimaker S5','Fabrication','Fabrication Lab'),('3D Printer - Ultimaker 2+','Fabrication','Fabrication Lab'),
('3D Printer - Markforged Mark Two','Fabrication','Fabrication Lab'),('Universal Testing Machine (Tinius Olsen)','Material Testing Equipment','Materials Testing Lab'),
('Semi-automated Screen-Printer','Fabrication','Fabrication Lab'),('3D-Printing - SLS','3D Printer - SLS','Fabrication Lab'),
('CNC Vertical Machining Center (BFW- BMV35T12)','Vertical Machining Center','Machining Lab'),('Friction Stir Welding Setup','Friction Stir Welding','Machining Lab'),
('High Speed Camera (Fastcam Mini)','Image Acquisition','Imaging & Sensing Lab'),('Acoustic Emission Sensor','Acoustic Emission Sensors','Materials Testing Lab'),
('Hyperspectral Imaging Camera (FS23 - FigSpec)','Hyperspectral Imaging Camera','Imaging & Sensing Lab'),('NAO6 Humanoid Robot','Humanoid Robot','Robotics Lab');

insert into public.faculty(name,designation,department,qualification,email,interests,background,research) values
('Dr. Rammohan S.','Associate Professor','Mechanical Engineering','Ph.D.','s_rammohan@cb.amrita.edu',
 'Bio-inspired robotics; Cyber-physical systems; Energy scavenging; Magnetoelectric transducer design; Tactile gripping; Precision agriculture',
 'Postdoctoral research at Virginia Tech; Research experience at Penn State',
 'Millipede-inspired robots; Soft robotic grippers; Controlled hopping robots; Self-balancing robots; Robotic systems for precision agriculture and animal farming'),
('AN Amudhan','Assistant Professor','Mechanical Engineering','B.E. Mechatronics; M.E. Engineering Design; Pursuing Ph.D. at NIT Calicut','amudhan@placeholder.invalid',
 'Deep learning; Mobile manipulators; Robot vision; Robotics',
 'B.E. from Sri Krishna College of Engineering and Technology (2013); M.E. from Government College of Technology, Coimbatore (2015)',
 'CNN-based small-object detection; Shuttlecock detection and fall-point prediction; Parallel manipulator kinematics; Omnidirectional robot trajectory tracking'),
('Dr. Madhu Mohan N.','Associate Professor','Electronics and Communication Engineering','Ph.D. in Instrumentation','n_madhumohan@cb.amrita.edu',
 'Analog circuits; Biomedical instrumentation; Instrumentation; Virtual instrumentation',
 'B.E. in ECE from NSS College of Engineering; M.E. and Ph.D. in Instrumentation from IIT Madras',
 'Contactless ECG monitoring; Oxygen saturation measurement; Sensor signal conditioning; Digital converters; Dermal perfusion measurement'),
('Dr. Adarsh S.','Assistant Professor (Senior Grade)','Electronics and Communication Engineering','M.E.; Ph.D.','s_adarsh@cb.amrita.edu',
 'Embedded system design; Processor architecture; System on a Chip (SoC)','',
 'ROS-based pedestrian detection and distance estimation using stereo vision, Leddar, and CNNs; Embedded systems; Processor architecture');
