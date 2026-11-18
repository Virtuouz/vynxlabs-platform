-- An app, an interface and a form have a title in their body. It is the
-- resource's title too, so that a list can show one without knowing the kind.
-- Filled in here for what is deployed already: otherwise the next deploy would
-- count each of them as changed, for a title it had all along.
update resource
  set title = body ->> 'title'
  where title is null
    and jsonb_typeof(body -> 'title') = 'string'
    and body ->> 'title' <> '';
