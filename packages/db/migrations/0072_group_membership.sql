-- Which values of an identity provider's groups claim put someone in a group,
-- as a release said it. Kept on the group, so that it is known before the
-- tenant has a provider, and is given to one that arrives later.
alter table principal_group add column sso_values text[] not null default '{}';
alter table end_user_group add column sso_values text[] not null default '{}';
