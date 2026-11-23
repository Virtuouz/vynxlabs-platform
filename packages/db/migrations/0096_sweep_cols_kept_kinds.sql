-- A connection binding keeps the kind of connector it was bound or deployed as, so it is read as
-- that kind when its declaration is gone and the bundles that held it are out of reach. A table
-- keeps where it was managed (`code` or `ui`) when it is retired.
alter table connection_binding add column if not exists connector text;
alter table data_table add column if not exists managed_in text;
