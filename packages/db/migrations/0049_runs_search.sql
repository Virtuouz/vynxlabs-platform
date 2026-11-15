-- Runs can be found by tag and by what went wrong, and a flow run knows the run it retries.

alter table run add column tags text[] not null default '{}';
alter table flow_run add column tags text[] not null default '{}';
create index run_tags_idx on run using gin (tags);
create index flow_run_tags_idx on flow_run using gin (tags);

-- The first line of the error, short enough to list. Kept by a trigger, so no path that
-- records a failure can leave it out. (Not a generated column: an import writes rows
-- whole, and a generated column refuses that.)
alter table run add column error_summary text;
alter table flow_run add column error_summary text;
create function set_error_summary() returns trigger language plpgsql as $$
begin
  new.error_summary := left(split_part(new.error->>'message', E'\n', 1), 200);
  return new;
end $$;
create trigger run_error_summary before insert or update of error on run
  for each row execute function set_error_summary();
create trigger flow_run_error_summary before insert or update of error on flow_run
  for each row execute function set_error_summary();
update run set error_summary = left(split_part(error->>'message', E'\n', 1), 200)
  where error is not null;
update flow_run set error_summary = left(split_part(error->>'message', E'\n', 1), 200)
  where error is not null;

alter table flow_run add column retry_of uuid;
create index flow_run_retry_of_idx on flow_run (retry_of) where retry_of is not null;

-- Searching inside error text is faster with trigram indexes. A database that does not
-- allow the extension still searches, more slowly.
do $$
begin
  begin
    create extension if not exists pg_trgm;
  exception when others then
    raise notice 'pg_trgm is not available; error search runs without its index';
  end;
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index run_error_summary_idx on run using gin (error_summary gin_trgm_ops);
    create index flow_run_error_summary_idx on flow_run using gin (error_summary gin_trgm_ops);
  end if;
end $$;
