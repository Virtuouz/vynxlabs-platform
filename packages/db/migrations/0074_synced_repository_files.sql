-- What a workspace and its branch last agreed on was kept by each file's path
-- inside the console's folder. Resource files are now kept anywhere in the
-- repository, so each is kept by its path from the repository's root.
update workspace_git
set synced_files = coalesce(
  (
    select jsonb_object_agg(git_repository.folder || '/' || entry.key, entry.value)
    from jsonb_each(workspace_git.synced_files) as entry
  ),
  '{}'::jsonb
)
from git_repository
where git_repository.tenant_id = workspace_git.tenant_id
  and workspace_git.synced_files <> '{}'::jsonb;
