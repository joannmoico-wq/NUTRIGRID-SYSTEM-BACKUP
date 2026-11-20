-- Run in the Supabase SQL Editor for the project currently used by the app.
begin;

create or replace function public.nutrigrid_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and lower(role) = 'admin'
      and approved is true
  );
$$;

revoke all on function public.nutrigrid_is_admin() from public, anon;
grant execute on function public.nutrigrid_is_admin() to authenticated;

alter table public.tasks enable row level security;
grant select, insert, update, delete on table public.tasks to authenticated;

drop policy if exists nutrigrid_tasks_read on public.tasks;
create policy nutrigrid_tasks_read on public.tasks
  for select to authenticated
  using (
    public.nutrigrid_is_admin()
    or assigned_to_user_id = (select auth.uid())
  );

commit;
