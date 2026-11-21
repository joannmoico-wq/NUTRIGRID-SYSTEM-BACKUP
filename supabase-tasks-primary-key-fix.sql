-- Run in the Supabase SQL Editor for the project used by the app.
-- Adds the row identity Supabase Table Editor needs to update or delete tasks.
-- This does not modify task data and stops if task_id values are unsafe.

begin;

do $$
begin
  if to_regclass('public.tasks') is null then
    raise exception 'Table public.tasks does not exist.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tasks'
      and column_name = 'task_id'
  ) then
    raise exception 'Column public.tasks.task_id does not exist.';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and contype = 'p'
  ) then
    raise notice 'public.tasks already has a primary key; no changes made.';
    return;
  end if;

  if exists (select 1 from public.tasks where task_id is null) then
    raise exception 'Cannot add the primary key: public.tasks.task_id contains NULL values. Resolve those rows before retrying.';
  end if;

  if exists (
    select task_id
    from public.tasks
    group by task_id
    having count(*) > 1
  ) then
    raise exception 'Cannot add the primary key: public.tasks.task_id contains duplicate values. Resolve those rows before retrying.';
  end if;

  alter table public.tasks
    add constraint tasks_pkey primary key (task_id);
end
$$;

commit;
