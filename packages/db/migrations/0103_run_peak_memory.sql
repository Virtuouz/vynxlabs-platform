-- The most memory a run's script process was seen to hold, in MB, as its worker reported it when
-- the run ended. The next start of the same script is planned at about this much, so that a
-- machine is handed only the scripts it has room for. It was first kept in the control plane's
-- memory alone: every restart forgot it, and the first scripts after a deploy were all planned at
-- the same flat figure, whatever they had taken the last time (phase 35). Null for a run that
-- ended before its process was looked at, and for every run from before this column.
alter table run add column if not exists peak_memory_mb integer;
