-- A hostname an operator of the instance enabled without the tenant proving it owns the name,
-- for a name that exists only inside a network. The tenant may turn it off and on again; an
-- operator who turns it off takes the mark back. Names enabled so far were enabled that way.
alter table app_domain add column enabled_by_operator boolean not null default false;
update app_domain set enabled_by_operator = true where enabled and verified_at is null;
