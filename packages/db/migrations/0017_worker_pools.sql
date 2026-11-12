-- Worker pools, for scripts that must run in a particular place, such as
-- inside a client's own network.

-- A credential with a pool serves only scripts that name that pool. One
-- without serves every script that names none.
alter table worker_credential
  add column pool text check (pool ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(pool) <= 40);

-- The pool a run waits for, copied from its script when the run is made.
alter table run add column pool text;

-- False when every script of the tenant runs on the tenant's own workers:
-- the instance then starts none for it.
alter table tenant add column managed_workers boolean not null default true;
