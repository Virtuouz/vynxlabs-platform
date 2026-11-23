-- The folder the files of a workspace's last sync were kept in. When the repository's volvel.yaml
-- moves the folder, the files it recorded are read as being in the new one, so a file that only
-- moved is not shown as changed on the branch. A workspace that synced before has none.
alter table workspace_git add column if not exists synced_folder text;
