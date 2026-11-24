-- A trigger of any type can refuse to start something, and says why: an input that does not fit,
-- a filter that fails, a source that is still busy, or an answer that could not be passed on.
alter table webhook_refusal drop constraint webhook_refusal_reason_check;
alter table webhook_refusal add constraint webhook_refusal_reason_check
  check (reason in ('signature', 'body', 'paused', 'input', 'filter', 'busy', 'error'));
