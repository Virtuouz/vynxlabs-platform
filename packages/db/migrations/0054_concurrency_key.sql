-- A script may limit its runs per value of a key in their input, such as one at a
-- time per customer. The run keeps the value it was given, to be shown, and to say
-- why a run waits.
alter table run add column concurrency_key text;
