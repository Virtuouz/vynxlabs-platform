-- A role for an agent offered one script or flow: it may start it, and nothing else.
-- Bound at the script or the flow, it makes that one a tool of the agent's MCP server.
insert into role (id, name, description, permissions, builtin) values
  ('00000000-0000-7000-8000-000000000010', 'agent_runner',
   'Starts the scripts and flows it is bound to. For agents offered a tool.',
   '{run:write,flow_run:write}', true);
