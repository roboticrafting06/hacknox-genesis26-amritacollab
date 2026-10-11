-- Migration 2: edit/cancel pending requests, remove/leave teammates, per-role department rules, custom roles.
-- Safe to run once on top of schema.sql. Paste into Supabase SQL Editor and Run.

create or replace function public.check_day_slot(p_day date, p_slot text) returns void language plpgsql as $$
begin
  if p_day < current_date then raise exception 'That date is in the past'; end if;
  if extract(isodow from p_day) > 5 then raise exception 'Slots are Monday to Friday only'; end if;
  if not valid_slot(p_slot) then raise exception 'Invalid slot'; end if;
end $$;

-- ===== 1. Students can edit or cancel their own requests until they are decided =====
create or replace function public.before_booking_update() returns trigger language plpgsql as $$
begin
  if old.status <> 'pending' then raise exception 'This request was already decided and can no longer be changed'; end if;
  new.student_id:=old.student_id; new.created_at:=old.created_at;
  new.student_name:=old.student_name; new.student_email:=old.student_email; new.student_dept:=old.student_dept;
  if public.app_role()='student' then
    new.status:='pending'; new.note:=null;
    perform check_day_slot(new.day,new.slot);
    if exists(select 1 from equipment_bookings where equipment_id=new.equipment_id and day=new.day and slot=new.slot and status='accepted') then
      raise exception 'That slot is already booked'; end if;
  else  -- lab: may only decide
    new.equipment_id:=old.equipment_id; new.purpose:=old.purpose; new.day:=old.day; new.slot:=old.slot;
    new.priority:=old.priority; new.score:=old.score; new.reason:=old.reason;
  end if;
  return new;
end $$;

create or replace function public.before_mentor_update() returns trigger language plpgsql as $$
begin
  if old.status <> 'pending' then raise exception 'This request was already decided and can no longer be changed'; end if;
  new.student_id:=old.student_id; new.faculty_id:=old.faculty_id; new.created_at:=old.created_at;
  new.student_name:=old.student_name; new.student_email:=old.student_email; new.student_dept:=old.student_dept;
  if public.app_role()='student' then
    new.status:='pending'; new.note:=null; new.final_day:=null; new.final_slot:=null;
    perform check_day_slot(new.day,new.slot);
  else  -- faculty: may only decide
    new.title:=old.title; new.description:=old.description; new.day:=old.day; new.slot:=old.slot;
    new.priority:=old.priority; new.score:=old.score; new.reason:=old.reason; new.attachment_path:=old.attachment_path;
    if new.status='accepted' then
      if new.final_day is null or new.final_day < current_date or extract(isodow from new.final_day)>5 or not valid_slot(new.final_slot) then
        raise exception 'Pick a valid future weekday and slot'; end if;
    else new.final_day:=null; new.final_slot:=null; end if;
  end if;
  return new;
end $$;

create policy "student edits pending booking" on public.equipment_bookings for update to authenticated
  using (student_id=auth.uid() and status='pending' and app_role()='student') with check (student_id=auth.uid() and status='pending');
create policy "student removes booking" on public.equipment_bookings for delete to authenticated
  using (student_id=auth.uid() and status in ('pending','rejected'));
create policy "student edits pending mentor req" on public.mentor_requests for update to authenticated
  using (student_id=auth.uid() and status='pending' and app_role()='student') with check (student_id=auth.uid() and status='pending');
create policy "student removes mentor req" on public.mentor_requests for delete to authenticated
  using (student_id=auth.uid() and status in ('pending','rejected'));
create policy "delete own mentor file" on storage.objects for delete to authenticated
  using (bucket_id='mentor-files' and (storage.foldername(name))[1]=auth.uid()::text);

-- ===== 2. Teams: custom roles, department rules, remove / leave members =====
alter table public.team_roles add column if not exists details text check (details is null or char_length(details) <= 200);
create table if not exists public.team_removed(request_id bigint not null references public.team_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, primary key(request_id,user_id));
alter table public.team_removed enable row level security;   -- no policies: only the functions below touch it

create or replace function public.accept_team_role(p_role bigint) returns void language plpgsql security definer set search_path=public as $$
declare r team_roles; t team_requests; me profiles; body text; m record;
begin
  select * into me from profiles where id=auth.uid();
  if me.role is distinct from 'student' then raise exception 'Students only'; end if;
  select * into r from team_roles where id=p_role; if not found then raise exception 'Role not found'; end if;
  select * into t from team_requests where id=r.request_id;
  if t.creator_id=me.id then raise exception 'You cannot accept your own request'; end if;
  if r.dept <> 'Any department' and me.dept is distinct from r.dept then
    raise exception 'This role is only open to % students', r.dept; end if;
  if exists(select 1 from team_removed where request_id=t.id and user_id=me.id) then raise exception 'The team creator removed you from this team'; end if;
  if exists(select 1 from team_roles where request_id=r.request_id and filled_by=me.id) then raise exception 'You already joined this team'; end if;
  update team_roles set filled_by=me.id, filled_name=me.name where id=p_role and filled_by is null;
  if not found then raise exception 'Someone else just took that role'; end if;
  select 'Team: '||t.title||E'\n\nMembers:\n'||string_agg('- '||x.name||' <'||x.email||'> - '||x.role, E'\n') into body from team_roster(t.id) x;
  for m in select distinct q.id from (select creator_id as id from team_requests where id=t.id union select filled_by from team_roles where request_id=t.id and filled_by is not null) q loop
    perform notify(m.id, 'Team '''||t.title||''': contact details', body);
  end loop;
end $$;

create or replace function public.remove_team_member(p_role bigint) returns void language plpgsql security definer set search_path=public as $$
declare r team_roles; t team_requests;
begin
  select * into r from team_roles where id=p_role; if not found then raise exception 'Role not found'; end if;
  select * into t from team_requests where id=r.request_id;
  if t.creator_id is distinct from auth.uid() then raise exception 'Only the team creator can remove members'; end if;
  if r.filled_by is null then raise exception 'That role has no member'; end if;
  insert into team_removed(request_id,user_id) values(t.id,r.filled_by) on conflict do nothing;
  perform notify(r.filled_by, 'Removed from team '''||t.title||'''', 'The team creator removed you from the '||r.specialization||' role.');
  update team_roles set filled_by=null, filled_name=null where id=p_role;
end $$;

create or replace function public.leave_team_role(p_role bigint) returns void language plpgsql security definer set search_path=public as $$
declare r team_roles; t team_requests; me profiles;
begin
  select * into me from profiles where id=auth.uid();
  select * into r from team_roles where id=p_role; if not found then raise exception 'Role not found'; end if;
  if r.filled_by is distinct from me.id then raise exception 'You are not in that role'; end if;
  select * into t from team_requests where id=r.request_id;
  update team_roles set filled_by=null, filled_name=null where id=p_role;
  perform notify(t.creator_id, me.name||' left '''||t.title||'''', me.name||' left the '||r.specialization||' role. It is open again.');
end $$;
grant execute on function public.remove_team_member, public.leave_team_role to authenticated;

create policy "creator edits open role" on public.team_roles for update to authenticated
  using (filled_by is null and exists(select 1 from team_requests t where t.id=request_id and t.creator_id=auth.uid()))
  with check (filled_by is null and exists(select 1 from team_requests t where t.id=request_id and t.creator_id=auth.uid()));
create policy "creator deletes open role" on public.team_roles for delete to authenticated
  using (filled_by is null and exists(select 1 from team_requests t where t.id=request_id and t.creator_id=auth.uid()));
create policy "creator edits team" on public.team_requests for update to authenticated using (creator_id=auth.uid()) with check (creator_id=auth.uid());

create or replace function public.team_lock() returns trigger language plpgsql as $$
begin new.creator_id:=old.creator_id; new.creator_name:=old.creator_name; new.creator_dept:=old.creator_dept; new.created_at:=old.created_at; return new; end $$;
drop trigger if exists t_team_lock on public.team_requests;
create trigger t_team_lock before update on public.team_requests for each row execute function public.team_lock();

create or replace function public.role_cap() returns trigger language plpgsql as $$
begin if (select count(*) from team_roles where request_id=new.request_id) >= 8 then raise exception 'A team can have at most 8 roles'; end if; return new; end $$;
drop trigger if exists t_role_cap on public.team_roles;
create trigger t_role_cap before insert on public.team_roles for each row execute function public.role_cap();

create or replace function public.team_deleted() returns trigger language plpgsql security definer set search_path=public as $$
declare m record;
begin for m in select filled_by from team_roles where request_id=old.id and filled_by is not null loop
  perform notify(m.filled_by, 'Team '''||old.title||''' was deleted', 'The creator deleted this team request.'); end loop; return old; end $$;
drop trigger if exists t_team_deleted on public.team_requests;
create trigger t_team_deleted before delete on public.team_requests for each row execute function public.team_deleted();

-- ===== 3. Resources: edit own requests, withdraw offers =====
create or replace function public.res_upd() returns trigger language plpgsql as $$
begin
  new.creator_id:=old.creator_id; new.creator_name:=old.creator_name; new.created_at:=old.created_at;
  if new.mode='rent' then
    if new.till_day is null or new.till_day < current_date then raise exception 'Pick a valid till date'; end if;
    new.expires_at:=new.till_day;
  else new.till_day:=null; new.expires_at:=case when old.mode='rent' then current_date+30 else old.expires_at end; end if;
  return new;
end $$;
drop trigger if exists t_res_upd on public.resource_requests;
create trigger t_res_upd before update on public.resource_requests for each row execute function public.res_upd();
create policy "edit own resource" on public.resource_requests for update to authenticated using (creator_id=auth.uid()) with check (creator_id=auth.uid());
create policy "withdraw offer" on public.resource_offers for delete to authenticated using (offerer_id=auth.uid());
