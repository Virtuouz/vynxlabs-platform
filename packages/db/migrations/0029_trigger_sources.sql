-- Where a trigger source that looks for new things had got to.
--
-- A source that polls an outside system gives back, with what it found, a
-- cursor: whatever it needs to pick up from there next time. It is kept with
-- the trigger, so that two triggers on one source each keep their own place.
alter table trigger_state add column cursor jsonb;
