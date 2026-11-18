-- A step that waits for approval now keeps who its approvers are by ID, so that
-- a group can be renamed while it waits. Steps that are waiting already named
-- them by name alone. Who that is today is written beside the names: the group
-- with that key or that name in the run's tenant, and every role of that name
-- the run's workspace can see.
update step_run s
set detail = s.detail || jsonb_build_object(
  'approverIds',
  jsonb_build_object(
    'groups',
    coalesce(
      (
        select jsonb_agg(distinct g.id)
        from principal_group g
        where g.tenant_id = f.tenant_id
          and (
            g.key in (select jsonb_array_elements_text(coalesce(s.detail -> 'approvers' -> 'groups', '[]'::jsonb)))
            or g.name in (select jsonb_array_elements_text(coalesce(s.detail -> 'approvers' -> 'groups', '[]'::jsonb)))
          )
      ),
      '[]'::jsonb
    ),
    'roles',
    coalesce(
      (
        select jsonb_agg(distinct r.id)
        from role r
        where r.name in (select jsonb_array_elements_text(coalesce(s.detail -> 'approvers' -> 'roles', '[]'::jsonb)))
          and (
            r.workspace_id = f.workspace_id
            or (r.tenant_id = f.tenant_id and r.workspace_id is null)
            or r.tenant_id is null
          )
      ),
      '[]'::jsonb
    )
  )
)
from flow_run f
where f.id = s.flow_run_id
  and s.status = 'waiting'
  and s.detail ? 'approvers'
  and not s.detail ? 'approverIds';
