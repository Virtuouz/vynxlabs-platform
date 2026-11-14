-- How the console looks on this instance.
--
-- The console keeps its own look whichever tenant is open. An operator brands
-- it once for the instance: a product name, a logo, and theme tokens in the
-- same shape a tenant's portal theme has. One row, or none for the defaults.
create table instance_branding (
  id boolean primary key default true check (id),
  product_name text check (length(product_name) between 1 and 60),
  -- {"tokens": {...}, "dark": {...}}: only the values the operator set.
  theme jsonb not null default '{"tokens": {}, "dark": {}}',
  logo_key text,
  logo_content_type text,
  updated_at timestamptz not null default now()
);
