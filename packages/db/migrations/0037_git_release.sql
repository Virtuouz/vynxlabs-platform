-- The repository's connection, said plainly, and the branch production mirrors.
--
-- `verified_at` is when the credential last worked. `credential_kind` names the
-- kind of token, read from its shape when it was saved, so the console can say
-- whether it belongs to the repository or to a person. Each promotion commits
-- what production now runs to `<release_branch>/<workspace slug>`; the branch is
-- written, never read. Null turns that off.
alter table git_repository
  add column verified_at timestamptz,
  add column credential_kind text not null default 'token',
  add column release_branch text default 'release';
update git_repository set verified_at = updated_at;
