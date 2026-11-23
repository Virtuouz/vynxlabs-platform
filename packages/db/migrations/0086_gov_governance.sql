-- GOV-01, INS-05: the instance's provider gives no role, and no provider gives the instance's own.
-- What an earlier version let be saved is cleared, so that nobody a provider makes holds it.
update identity_provider set default_role_id = null
  where tenant_id is null
     or default_role_id in (select id from role where name = 'operator_admin');
