-- Counters for rate-limited routes, shared by every replica of the control plane.
-- A row is one key (a route and a caller) in its current window. Unlogged: a
-- counter lost in a crash costs one window's limit, and nothing else.
create unlogged table rate_limit (
  key text primary key,
  hits integer not null,
  window_ends timestamptz not null
);
create index rate_limit_window_ends on rate_limit (window_ends);
