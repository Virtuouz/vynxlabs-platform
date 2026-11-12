-- Dedicated databases for a tenant's custom tables, and a sign-in of its own
-- for requests for rows.

-- A database other than this one where tenants' custom tables can live. The
-- tenant record names a location. The address is here, encrypted with the
-- instance master key.
create table database_location (
  name text primary key check (name ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(name) <= 63),
  description text not null default '',
  connection_encrypted bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The catalog of a workspace's tables lives beside the tables: in this
-- database for most tenants, in a dedicated one for some. It therefore cannot
-- point at rows that exist only here. The code keeps these in step instead.
alter table data_table drop constraint data_table_tenant_id_fkey;
alter table data_table drop constraint data_table_workspace_id_fkey;
alter table data_table drop constraint data_table_resource_id_fkey;
create index data_table_tenant_idx on data_table (tenant_id);
