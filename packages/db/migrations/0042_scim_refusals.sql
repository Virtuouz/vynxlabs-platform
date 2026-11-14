-- Pushes from an identity provider that were refused, and why: an address
-- outside the provider's domains, a name already taken. The newest few per
-- provider are kept, so the console can show why someone did not arrive.
-- Never what was pushed, only what was refused and the reason.
create table scim_refusal (
  id uuid primary key,
  provider_id uuid not null references identity_provider (id) on delete cascade,
  tenant_id uuid references tenant (id),
  method text not null,
  resource text not null check (resource in ('Users', 'Groups', 'other')),
  status integer not null,
  reason text not null,
  occurred_at timestamptz not null default now()
);
create index scim_refusal_provider_idx on scim_refusal (provider_id, occurred_at desc);
