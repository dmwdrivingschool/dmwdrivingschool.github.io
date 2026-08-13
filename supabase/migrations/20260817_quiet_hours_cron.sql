-- Message quiet hours: PupilMessages.tsx correctly holds a pupil's message in
-- queued_pupil_messages during quiet hours, and the send-queued-pupil-messages
-- Edge Function correctly releases anything due. But nothing was ever
-- scheduling that function to run — its file header just says "Schedule
-- every 5 minutes (Supabase Cron / external scheduler)" as a manual step
-- that was never done. From the instructor's side this looks exactly like
-- "quiet hours isn't working": a pupil's message sent during the window
-- appears to vanish and never arrives, even after the window closes.
--
-- This schedules it with pg_cron + pg_net (same call pattern already used
-- in 20260813_arrival_push.sql for send-push).
--
-- >>> Replace BOTH placeholders below before running:
--       YOUR-PROJECT-REF      -> your project ref (subdomain of your *.supabase.co URL)
--       YOUR-SERVICE-ROLE-KEY -> Project Settings -> API -> service_role key (secret)
-- <<<

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid)
from cron.job
where jobname = 'send-queued-pupil-messages';

select cron.schedule(
  'send-queued-pupil-messages',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-queued-pupil-messages',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR-SERVICE-ROLE-KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
