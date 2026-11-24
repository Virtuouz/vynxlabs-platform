-- When a name that was proved stopped being found: shown beside the first date it was proved,
-- audited once, and nothing is stopped by it. Cleared when the record is found again.
alter table app_domain add column record_gone_at timestamptz;
alter table identity_domain add column record_gone_at timestamptz;
