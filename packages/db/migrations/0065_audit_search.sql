-- Searching a tenant's audit log by who acted, or by what it was done to, without
-- reading the whole log. Made on the partitioned table, each index reaches every
-- month's partition, those that exist and those made later.
create index audit_entry_actor_idx on audit_entry (tenant_id, actor_id, id desc);
create index audit_entry_target_idx on audit_entry (tenant_id, target_type, target_id, id desc);
