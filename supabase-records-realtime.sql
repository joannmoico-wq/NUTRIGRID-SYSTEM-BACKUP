-- Run in the Supabase SQL Editor to enable immediate record updates across Admin and PWA clients.
-- FULL row identity lets clients identify the record owner and local ID on DELETE events.
do $$
declare
  table_name text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase Realtime publication was not found.';
  end if;

  foreach table_name in array array[
    'residents',
    'environmental_sanitation',
    'infant_feeding',
    'lactating_women',
    'pregnant_women',
    'monthly_natality'
  ] loop
    execute format('alter table public.%I replica identity full', table_name);

    if not exists (
      select 1
      from pg_publication_tables publication_table
      where publication_table.pubname = 'supabase_realtime'
        and publication_table.schemaname = 'public'
        and publication_table.tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end
$$;