-- Run AFTER creating staff users in Supabase Dashboard > Authentication > Users (tick "Auto Confirm User").
-- Faculty: create a user with the same email as in the `faculty` table (e.g. s_adarsh@cb.amrita.edu).
-- Lab assistant: create any user, then put their email below.
update public.faculty f set user_id = p.id from public.profiles p where lower(p.email) = lower(f.email);
update public.profiles set role='faculty' where id in (select user_id from public.faculty where user_id is not null);
update public.profiles set role='lab' where lower(email) = lower('lab@yourdomain.edu');   -- <- change
-- To fix Amudhan's email: update public.faculty set email='real@email' where name='AN Amudhan';
