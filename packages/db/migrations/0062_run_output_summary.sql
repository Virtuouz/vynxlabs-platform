-- A short, redacted line of what a run produced, to list beside the error summary.
-- Written by the control plane when a run ends, because what is masked follows the
-- run's schemas, which the database does not know. Runs that ended before this have none.
alter table run add column output_summary text;
alter table flow_run add column output_summary text;
