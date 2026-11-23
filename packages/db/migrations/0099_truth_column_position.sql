-- Where a column stands among its table's columns, in the order its definition gave them when it
-- was made. Columns that are already there have none: they keep the order they have always had
-- (when they were made, then by name), and a column made from now on follows them.
alter table data_column add column if not exists position integer;
