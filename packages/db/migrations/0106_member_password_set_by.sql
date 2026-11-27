-- Who else chose the password an account has now (phase 35, round five).
-- When an admin or an operator types a password for someone else's account, or is handed back a
-- link and uses it, that person knows the password. The account then starts again when a
-- DIFFERENT person adds it to a tenant (round four), but not when this same person adds it to
-- one more place: they could already sign in as it, so nobody new is exposed.
--
-- Both columns are null when the password was chosen by the account's owner (through a mailed
-- link, or while signed in), when single sign-on proved the account, and for every account that
-- existed before this migration (nobody knows who chose its password, so the round-four rule
-- applies to it as before).
alter table member add column password_set_by_type text;
alter table member add column password_set_by_id uuid;
comment on column member.password_set_by_type is
  'The kind of principal (member or service_account) who typed the current password for someone else, or was handed back the link that set it. Null: the owner chose it, or nobody knows.';
comment on column member.password_set_by_id is
  'The id of that principal. Only the last one counts. It is not a foreign key: if that person goes away it simply names nobody who can act.';

alter table member_password_token add column made_by_type text;
alter table member_password_token add column made_by_id uuid;
comment on column member_password_token.made_by_type is
  'The kind of principal who made the link. Used only when the link was handed back (not mailed): that person is then the one who set the password the link sets.';
comment on column member_password_token.made_by_id is
  'The id of the principal who made the link.';
