-- Fixes two issues with instructor Appointments visible to pupils:
--
-- 1) "Could not find the 'visible_to_pupil' column of 'lessons' in the
--    schema cache" — the column was added in 20260814_appointment_pupil_
--    visibility.sql, but if that migration was never actually applied to
--    this database, the column (and pupil_visible_appointments()) won't
--    exist yet. This re-issues the add-column step idempotently so it's
--    safe to run regardless of whether the earlier migration ran.
--
-- 2) Appointments on Saturday/Sunday were never shown to pupils, even with
--    "Show to pupils" switched on, because pupil_visible_appointments()
--    hardcoded `extract(dow from start_time) not in (0, 6)`. The tick box
--    is meant to be the only control — remove the weekend exclusion.

alter table public.lessons
  add column if not exists visible_to_pupil boolean not null default true;

create or replace function public.pupil_visible_appointments()
returns table (id uuid, start_time timestamptz, end_time timestamptz, title text)
language sql
security definer
set search_path = public
as $$
  select id, start_time, end_time, title
  from public.lessons
  where pupil_id is null
    and lesson_type = 'private'
    and title = 'Appointment'
    and coalesce(visible_to_pupil, true) = true
  order by start_time;
$$;

grant execute on function public.pupil_visible_appointments() to authenticated;
