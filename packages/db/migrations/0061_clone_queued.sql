-- A clone with data waits its turn: one copies rows at a time across the instance, so a
-- large copy does not slow every other tenant's tables down with it.
alter table workspace_clone drop constraint workspace_clone_status_check;
alter table workspace_clone
  add constraint workspace_clone_status_check
  check (status in ('queued', 'running', 'succeeded', 'failed'));
