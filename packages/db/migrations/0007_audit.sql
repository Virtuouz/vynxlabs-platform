-- The audit stream. It has no foreign keys: entries outlive what they describe.
create table audit_entry (
  id uuid primary key,
  occurred_at timestamptz not null default now(),
  tenant_id uuid,
  workspace_id uuid,
  actor_type text not null,
  actor_id uuid,
  api_key_id uuid,
  access_grant_id uuid,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}',
  ip_address text,
  user_agent text,
  request_id text
);
create index audit_entry_tenant_idx on audit_entry (tenant_id, id desc);

create function audit_entry_is_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'the audit log is append-only' using errcode = 'insufficient_privilege';
end $$;
create trigger audit_entry_no_change before update or delete on audit_entry
  for each row execute function audit_entry_is_append_only();
create trigger audit_entry_no_truncate before truncate on audit_entry
  for each statement execute function audit_entry_is_append_only();
