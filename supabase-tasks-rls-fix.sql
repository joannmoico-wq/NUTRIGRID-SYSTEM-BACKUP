-- Run in the Supabase SQL Editor for the project configured in the app.
-- Task writes are limited to approved admins; assigned staff may update their
-- own task status, while the task-update trigger prevents editing task details.

begin;

create or replace function public.nutrigrid_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and lower(trim(role)) = 'admin'
      and approved is true
  );
$$;

revoke all on function public.nutrigrid_is_admin() from public, anon;
grant execute on function public.nutrigrid_is_admin() to authenticated;

create or replace function public.nutrigrid_restrict_task_updates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.nutrigrid_is_admin()
     and (
       new.assigned_to_user_id is distinct from old.assigned_to_user_id
       or new.priority is distinct from old.priority
       or new.purok is distinct from old.purok
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.due_date is distinct from old.due_date
     )
     and not (
       old.status <> 'Completed'
       and old.due_date is not null
       and old.due_date <= current_date - 1
       and new.due_date = current_date
       and new.overdue_count = coalesce(old.overdue_count, 0) + 1
       and new.overdue_last_processed_due_date = old.due_date
     ) then
    raise exception 'Only an approved admin can edit task details.';
  end if;
  return new;
end;
$$;

drop trigger if exists nutrigrid_restrict_task_updates on public.tasks;
create trigger nutrigrid_restrict_task_updates
  before update on public.tasks
  for each row execute function public.nutrigrid_restrict_task_updates();

alter table public.tasks enable row level security;
grant select, insert, update, delete on public.tasks to authenticated;
grant select on public.tasks to service_role;

drop policy if exists nutrigrid_tasks_read on public.tasks;
create policy nutrigrid_tasks_read on public.tasks
  for select to authenticated
  using (
    public.nutrigrid_is_admin()
    or assigned_to_user_id = (select auth.uid())
  );

drop policy if exists nutrigrid_tasks_insert on public.tasks;
create policy nutrigrid_tasks_insert on public.tasks
  for insert to authenticated
  with check (public.nutrigrid_is_admin());

drop policy if exists nutrigrid_tasks_update on public.tasks;
create policy nutrigrid_tasks_update on public.tasks
  for update to authenticated
  using (
    public.nutrigrid_is_admin()
    or assigned_to_user_id = (select auth.uid())
  )
  with check (
    public.nutrigrid_is_admin()
    or assigned_to_user_id = (select auth.uid())
  );

drop policy if exists nutrigrid_tasks_delete on public.tasks;
create policy nutrigrid_tasks_delete on public.tasks
  for delete to authenticated
  using (public.nutrigrid_is_admin());

do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase Realtime publication supabase_realtime does not exist.';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end
$$;

commit;
