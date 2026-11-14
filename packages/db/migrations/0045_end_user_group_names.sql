-- A group of end users takes any one-line name, as a group of members does.
-- Rows still match a group by its name in a text column.
alter table end_user_group drop constraint if exists end_user_group_name_check;
alter table end_user_group
  add constraint end_user_group_name_check
  check (char_length(name) between 1 and 100 and name !~ '^\s|\s$' and position(E'\n' in name) = 0);
