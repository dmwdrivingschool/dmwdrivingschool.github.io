-- 20260816_pupil_read_instructor_away.sql gave pupils a row-level SELECT
-- policy on 'Away' rows so PupilHome.tsx could show them. That policy is
-- row-level only — it doesn't stop a pupil's own client from requesting the
-- `notes` column on those rows directly, even though the app's UI never
-- shows it. Appointments already avoid this by going through a
-- SECURITY DEFINER function whose return type simply has no notes column;
-- give 'Away' rows the same guarantee and stop granting pupils raw table
-- access to `lessons` for this purpose.

drop policy if exists lessons_pupil_read_instructor_away on public.lessons;

create or replace function public.pupil_visible_away()
returns table (id uuid, start_time timestamptz, end_time timestamptz, title text)
language sql
security definer
set search_path = public
as $$
  select id, start_time, end_time, title
  from public.lessons
  where pupil_id is null
    and lesson_type = 'private'
    and title = 'Away'
  order by start_time;
$$;

grant execute on function public.pupil_visible_away() to authenticated;
