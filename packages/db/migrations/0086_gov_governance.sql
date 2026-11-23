-- GOV-01, INS-05: the instance's provider gives no role, and no provider gives the instance's own.
-- What an earlier version let be saved is cleared, so that nobody a provider makes holds it.
update identity_provider set default_role_id = null
  where tenant_id is null
     or default_role_id in (select id from role where name = 'operator_admin');

-- GOV-05: who turned a person off. A push from a directory resumes only what a push turned off:
-- what a person here turned off stays off until a person here lifts it. What was off before
-- this is taken to be by hand.
alter table tenant_member add column suspended_by text check (suspended_by in ('hand', 'provider'));
alter table member add column disabled_by text check (disabled_by in ('hand', 'provider'));
alter table end_user add column disabled_by text check (disabled_by in ('hand', 'provider'));
update tenant_member set suspended_by = 'hand' where suspended_at is not null;
update member set disabled_by = 'hand' where disabled_at is not null;
update end_user set disabled_by = 'hand' where disabled_at is not null;
