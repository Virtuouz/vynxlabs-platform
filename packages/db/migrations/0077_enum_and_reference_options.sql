-- A column keeps what its type alone does not say: for an enum, the values it
-- has and the ones it had and still allows; for a reference, what happens when
-- the row it points to is deleted. A table keeps the column that stands for a
-- row where another table refers to it.
alter table data_column add column if not exists options jsonb;
alter table data_column add column if not exists on_delete text;
alter table data_table add column if not exists display_column text;
