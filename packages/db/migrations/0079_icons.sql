-- The icons made from a logo, by size: what a browser's tab, a phone's home
-- screen and a web manifest show. Each is a PNG in file storage, kept by its
-- key: {"32": "branding/…", "180": "…", "192": "…", "512": "…"}.
alter table instance_branding add column icons jsonb not null default '{}';
alter table tenant_portal add column icons jsonb not null default '{}';
