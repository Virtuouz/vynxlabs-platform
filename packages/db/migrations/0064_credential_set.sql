-- When a stored credential was last set, and by whom, so a form can say "Set
-- 3 days ago by ada@acme.example" without ever showing the value. A trigger
-- stamps it whenever the sealed value changes, on every path that writes one,
-- unless the write sets the stamp itself, as moving a tenant between instances does.
-- Who comes from the transaction: each change sets `vx.actor_type` and
-- `vx.actor_id` locally before it writes (see `mutate`).

create function stamp_credential_set() returns trigger language plpgsql as $$
begin
  -- A row that brings its own stamp keeps it, as an imported tenant's rows do.
  if (tg_op = 'INSERT' and new.credential is not null and new.credential_set_at is null)
     or (tg_op = 'UPDATE' and new.credential is distinct from old.credential
         and new.credential_set_at is not distinct from old.credential_set_at) then
    if new.credential is null then
      new.credential_set_at := null;
      new.credential_set_by_type := null;
      new.credential_set_by_id := null;
    else
      new.credential_set_at := now();
      new.credential_set_by_type := nullif(current_setting('vx.actor_type', true), '');
      new.credential_set_by_id := nullif(current_setting('vx.actor_id', true), '')::uuid;
    end if;
  end if;
  return new;
end $$;

-- An identity provider keeps its client secret, or its private key, in `secrets`.
create function stamp_secrets_set() returns trigger language plpgsql as $$
begin
  -- A row that brings its own stamp keeps it, as an imported tenant's rows do.
  if (tg_op = 'INSERT' and new.secrets is not null and new.credential_set_at is null)
     or (tg_op = 'UPDATE' and new.secrets is distinct from old.secrets
         and new.credential_set_at is not distinct from old.credential_set_at) then
    if new.secrets is null then
      new.credential_set_at := null;
      new.credential_set_by_type := null;
      new.credential_set_by_id := null;
    else
      new.credential_set_at := now();
      new.credential_set_by_type := nullif(current_setting('vx.actor_type', true), '');
      new.credential_set_by_id := nullif(current_setting('vx.actor_id', true), '')::uuid;
    end if;
  end if;
  return new;
end $$;

alter table connection_binding
  add column credential_set_at timestamptz,
  add column credential_set_by_type text,
  add column credential_set_by_id uuid;
update connection_binding set credential_set_at = updated_at where credential is not null;
create trigger connection_binding_credential_set before insert or update on connection_binding
  for each row execute function stamp_credential_set();

alter table data_source_binding
  add column credential_set_at timestamptz,
  add column credential_set_by_type text,
  add column credential_set_by_id uuid;
update data_source_binding set credential_set_at = updated_at where credential is not null;
create trigger data_source_binding_credential_set before insert or update on data_source_binding
  for each row execute function stamp_credential_set();

alter table connection_group_member
  add column credential_set_at timestamptz,
  add column credential_set_by_type text,
  add column credential_set_by_id uuid;
update connection_group_member set credential_set_at = updated_at where credential is not null;
create trigger connection_group_member_credential_set
  before insert or update on connection_group_member
  for each row execute function stamp_credential_set();

alter table git_repository
  add column credential_set_at timestamptz,
  add column credential_set_by_type text,
  add column credential_set_by_id uuid;
update git_repository set credential_set_at = updated_at;
create trigger git_repository_credential_set before insert or update on git_repository
  for each row execute function stamp_credential_set();

alter table identity_provider
  add column credential_set_at timestamptz,
  add column credential_set_by_type text,
  add column credential_set_by_id uuid;
update identity_provider set credential_set_at = updated_at where secrets is not null;
create trigger identity_provider_secrets_set before insert or update on identity_provider
  for each row execute function stamp_secrets_set();
