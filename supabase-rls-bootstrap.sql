begin;

alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;

drop policy if exists nutrigrid_profiles_read_own on public.profiles;
create policy nutrigrid_profiles_read_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

create or replace function public.is_approved_staff()
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

revoke all on function public.is_approved_staff() from public, anon;
grant execute on function public.is_approved_staff() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'residents',
    'environmental_sanitation',
    'infant_feeding',
    'lactating_women',
    'pregnant_women',
    'monthly_natality'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);

    execute format('drop policy if exists nutrigrid_member_read_own on public.%I', table_name);
    execute format(
      'create policy nutrigrid_member_read_own on public.%I
       for select to authenticated
       using (
         public.is_approved_staff()
         and (
           created_by_user_id = (select auth.uid())
           or data->>''created_by_user_id'' = (select auth.uid())::text
         )
       )',
      table_name
    );

    execute format('drop policy if exists nutrigrid_member_insert_own on public.%I', table_name);
    execute format(
      'create policy nutrigrid_member_insert_own on public.%I
       for insert to authenticated
       with check (
         public.is_approved_staff()
         and created_by_user_id = (select auth.uid())
       )',
      table_name
    );

    execute format('drop policy if exists nutrigrid_member_update_own on public.%I', table_name);
    execute format(
      'create policy nutrigrid_member_update_own on public.%I
       for update to authenticated
       using (
         public.is_approved_staff()
         and (
           created_by_user_id = (select auth.uid())
           or data->>''created_by_user_id'' = (select auth.uid())::text
         )
       )
       with check (
         public.is_approved_staff()
         and created_by_user_id = (select auth.uid())
       )',
      table_name
    );

    execute format('drop policy if exists nutrigrid_member_delete_own on public.%I', table_name);
    execute format(
      'create policy nutrigrid_member_delete_own on public.%I
       for delete to authenticated
       using (
         public.is_approved_staff()
         and (
           created_by_user_id = (select auth.uid())
           or data->>''created_by_user_id'' = (select auth.uid())::text
         )
       )',
      table_name
    );

    execute format('drop policy if exists nutrigrid_admin_read_all on public.%I', table_name);
    execute format(
      'create policy nutrigrid_admin_read_all on public.%I
       for select to authenticated
       using (
         exists (
           select 1
           from public.profiles p
           where p.id = (select auth.uid())
             and p.approved is true
             and lower(p.role) = ''admin''
         )
       )',
      table_name
    );

    execute format('drop policy if exists nutrigrid_admin_insert_all on public.%I', table_name);
    execute format(
      'create policy nutrigrid_admin_insert_all on public.%I
       for insert to authenticated
       with check (
         exists (
           select 1
           from public.profiles p
           where p.id = (select auth.uid())
             and p.approved is true
             and lower(p.role) = ''admin''
         )
       )',
      table_name
    );

    execute format('drop policy if exists nutrigrid_admin_update_all on public.%I', table_name);
    execute format(
      'create policy nutrigrid_admin_update_all on public.%I
       for update to authenticated
       using (
         exists (
           select 1
           from public.profiles p
           where p.id = (select auth.uid())
             and p.approved is true
             and lower(p.role) = ''admin''
         )
       )
       with check (
         exists (
           select 1
           from public.profiles p
           where p.id = (select auth.uid())
             and p.approved is true
             and lower(p.role) = ''admin''
         )
       )',
      table_name
    );

    execute format('drop policy if exists nutrigrid_admin_delete_all on public.%I', table_name);
    execute format(
      'create policy nutrigrid_admin_delete_all on public.%I
       for delete to authenticated
       using (
         exists (
           select 1
           from public.profiles p
           where p.id = (select auth.uid())
             and p.approved is true
             and lower(p.role) = ''admin''
         )
       )',
      table_name
    );
  end loop;
end
$$;

commit;
