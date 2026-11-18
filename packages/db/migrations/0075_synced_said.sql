-- What each workspace's resources said when it last agreed with its branch, as
-- a checksum per file of the console's own rendering of them.
--
-- `synced_files` holds the checksums of the bytes on the branch. Those bytes are
-- the author's: a file written by hand keeps its comments and its order when the
-- console changes something in it. So whether the workspace changed a resource
-- since the last sync cannot be read from bytes any more. It is read from what
-- the resource says, which this keeps. Empty until a workspace next syncs; until
-- then the bytes are compared, as before.
alter table workspace_git add column synced_said jsonb;
