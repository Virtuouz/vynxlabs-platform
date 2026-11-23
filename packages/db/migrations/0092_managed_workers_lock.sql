-- Whether an operator turned off the instance starting workers for a tenant. While it is set, a
-- tenant's own admin cannot turn it on again: the machine is the operator's.
alter table tenant add column managed_workers_locked boolean not null default false;
