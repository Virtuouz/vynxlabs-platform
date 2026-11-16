-- The operator's own switches for the whole instance: one row, or none for the defaults.
-- With triggers paused, no schedule, source, webhook, form or event starts anything in
-- any tenant. A schedule keeps its due time, and fires once when triggers resume.
create table instance_control (
  id boolean primary key default true check (id),
  triggers_paused boolean not null default false,
  reason text check (length(reason) <= 500),
  updated_at timestamptz not null default now()
);
