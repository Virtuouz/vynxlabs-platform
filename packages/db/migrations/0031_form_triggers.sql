-- A trigger that is a form.
--
-- A form trigger has an address, as a webhook has, and a page there that
-- anyone given the address can fill in. What they send starts the trigger's
-- script or flow.
alter table trigger_state drop constraint trigger_state_type_check;
alter table trigger_state
  add constraint trigger_state_type_check check (type in ('schedule', 'webhook', 'event', 'form'));
