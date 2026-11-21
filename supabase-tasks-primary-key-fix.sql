-- Run in the Supabase SQL Editor for the project used by the app.
-- Adds the row identity Supabase Table Editor needs to update or delete tasks.
-- Fills missing bigint task IDs without changing or deleting task rows.

begin;

do $$
declare
  task_sequence text;
  sequence_last_value bigint;
  max_task_id bigint;
  sequence_start bigint;
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

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tasks'
      and column_name = 'task_id'
      and data_type = 'bigint'
  ) then
    raise exception 'Cannot repair public.tasks.task_id: expected a bigint column.';
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

  if exists (
    select task_id
    from public.tasks
    where task_id is not null
    group by task_id
    having count(*) > 1
  ) then
    raise exception 'Cannot add the primary key: public.tasks.task_id contains duplicate values. Resolve those rows before retrying.';
  end if;

  task_sequence := pg_get_serial_sequence('public.tasks', 'task_id');
  if task_sequence is null then
    if to_regclass('public.tasks_task_id_repair_seq') is not null then
      raise exception 'Sequence public.tasks_task_id_repair_seq already exists but is not attached to task_id; inspect it before retrying.';
    end if;

    execute 'create sequence public.tasks_task_id_repair_seq';
    execute 'alter sequence public.tasks_task_id_repair_seq owned by public.tasks.task_id';
    execute 'alter table public.tasks alter column task_id set default nextval(''public.tasks_task_id_repair_seq''::regclass)';
    task_sequence := 'public.tasks_task_id_repair_seq';
  end if;

  execute format('select last_value from %s', task_sequence::regclass)
    into sequence_last_value;
  select max(task_id)
    into max_task_id
    from public.tasks;

  sequence_start := greatest(
    coalesce(max_task_id, 0),
    coalesce(sequence_last_value, 0),
    1
  );
  if sequence_start = 9223372036854775807
     and exists (select 1 from public.tasks where task_id is null) then
    raise exception 'Cannot assign missing task IDs: the bigint ID range is exhausted.';
  end if;
  perform setval(task_sequence::regclass, sequence_start, sequence_start > 0);

  execute format(
    'update public.tasks set task_id = nextval(%L::regclass) where task_id is null',
    task_sequence
  );

  execute format(
    'grant usage, select on sequence %s to authenticated',
    task_sequence::regclass
  );

  alter table public.tasks
    add constraint tasks_pkey primary key (task_id);
end
$$;

commit;
