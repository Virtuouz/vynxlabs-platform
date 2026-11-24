-- Who made a service account's key, and, for a change to access asked with such a key, who made
-- the key it was asked with: so that one person cannot ask for a change through a service
-- account and then approve it as themselves. Neither is a reference: the member may be gone.
alter table api_key add column created_by uuid;
alter table tenant_release add column asked_through uuid;
