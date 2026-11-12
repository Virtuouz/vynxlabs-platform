-- The tenant record and its data location. Phase 1 extends this table.
create table tenant (
  id uuid primary key,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 63),
  data_location jsonb not null default '{"kind": "shared"}'
    -- coalesce: a check that evaluates to null would pass.
    check (
      coalesce(
        data_location = '{"kind": "shared"}'::jsonb
        or (
          data_location ->> 'kind' = 'dedicated'
          and jsonb_typeof(data_location -> 'ref') = 'string'
          and length(data_location ->> 'ref') > 0
        ),
        false
      )
    ),
  created_at timestamptz not null default now()
);
