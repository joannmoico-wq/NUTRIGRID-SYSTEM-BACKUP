-- Record BHW/admin edits with before-and-after values for the Admin Activity Logs.
-- Run in the Supabase SQL Editor as the project owner.

create or replace function public.nutrigrid_is_approved_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and approved is true
      and lower(role) in ('admin', 'field_worker')
  );
$$;

create or replace function public.nutrigrid_is_activity_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and approved is true
      and lower(role) = 'admin'
  );
$$;

revoke all on function public.nutrigrid_is_approved_staff() from public;
revoke all on function public.nutrigrid_is_activity_admin() from public;
grant execute on function public.nutrigrid_is_approved_staff() to authenticated;
grant execute on function public.nutrigrid_is_activity_admin() to authenticated;

create table if not exists public.record_activity_logs (
  id text primary key,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  actor_name text not null,
  actor_role text not null default 'unknown',
  category text not null,
  record_id text not null,
  field_changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.record_activity_logs
  add column if not exists actor_role text not null default 'unknown';

create index if not exists record_activity_logs_created_at_idx
  on public.record_activity_logs (created_at desc);
create index if not exists record_activity_logs_actor_created_idx
  on public.record_activity_logs (actor_user_id, created_at desc);

alter table public.record_activity_logs enable row level security;
grant select, insert on public.record_activity_logs to authenticated;

drop policy if exists record_activity_logs_insert_own on public.record_activity_logs;
create policy record_activity_logs_insert_own
  on public.record_activity_logs
  for insert
  to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and public.nutrigrid_is_approved_staff()
    and actor_role = (
      select lower(role)
      from public.profiles
      where id = (select auth.uid())
        and approved is true
    )
  );

drop policy if exists record_activity_logs_admin_read on public.record_activity_logs;
create policy record_activity_logs_admin_read
  on public.record_activity_logs
  for select
  to authenticated
  using (public.nutrigrid_is_activity_admin());
