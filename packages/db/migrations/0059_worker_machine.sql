-- The machine a worker runs on, as the worker host or the control plane that started it
-- names it. Workers on one machine share its run slots: past them, none claims more.
alter table worker add column machine text;
create index worker_machine_idx on worker (machine) where machine is not null;
create index run_running_worker_idx on run (worker_id) where status = 'running';
create index task_running_worker_idx on task (worker_id) where status = 'running';
