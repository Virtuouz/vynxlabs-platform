-- An approval is now listed in its workspace, and for the tenant only when its
-- step says `surface: tenant`. Every approval there was until now was listed
-- for the tenant, so each keeps its place there: the ones waiting, so that
-- nobody loses sight of a decision they were asked for, and the ones decided,
-- so that the tenant's history stays whole.
update step_run
set detail = detail || '{"surface": "tenant"}'::jsonb
where detail ? 'title' and not detail ? 'surface';
