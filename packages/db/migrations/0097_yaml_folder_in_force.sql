-- The folder `volvel.yaml` names for the console's resource files wins over the folder set on the
-- Repository page (D65). The last sync or check records what the file said, so the page can say
-- which folder is in force and where it comes from. Null until a branch has been read.
alter table git_repository add column if not exists file_folder text;
alter table git_repository add column if not exists file_read_at timestamptz;
