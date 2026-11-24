-- For a resource owned as files, the content it last had in step with the repository: set by a
-- deploy of repository files, by `volvel pull`, and by a Git sync push or pull. A repository
-- deploy that would replace a resource whose content differs from it, changed in the console
-- since, is refused. Null for a resource that never was in step: made in the console, or in a
-- workspace that has never had a deploy from a repository.
alter table resource add column if not exists basis_hash text;
