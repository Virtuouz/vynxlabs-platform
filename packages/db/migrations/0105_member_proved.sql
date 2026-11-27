-- Whether the person an account is for has shown the account is theirs (phase 35, round four).
-- An account is one for each email address on the whole instance, and a tenant admin who adds
-- someone may type the password. A password typed by someone else proves nothing about the
-- owner, so such an account is "not proved". It becomes proved when its owner sets a password
-- through a link that was sent to the account's own address, signs in through single sign-on
-- from a provider whose domain was proved, or is the instance's first operator.
--
-- A tenant that adds an account that is not proved starts it again: what could sign in as it
-- before (sessions, personal keys, recovery codes, the password) ends. A proved account keeps
-- everything when another tenant adds it.
--
-- Nothing is ended by this migration. Accounts that already belong to two or more tenants, hold
-- access at the instance, or are tied to a single sign-on identity are marked proved here, so
-- that no person who signs in today is signed out by it. Every other existing account stays not
-- proved; it is ended only if it later gains a place somewhere.
alter table member add column proved_at timestamptz;
comment on column member.proved_at is
  'When the owner of this account showed it is theirs: they set a password through a link mailed to the account''s address, or signed in through single sign-on from a proved domain, or it is the first operator, or it was already shared by several tenants when this was added. Null: nobody has proved it, and a password on it may have been typed by whoever made it. A password typed by an admin never sets this.';

alter table member_password_token add column mailed boolean not null default false;
comment on column member_password_token.mailed is
  'True when the link was sent to the account''s own address and not handed to whoever asked for it. Only such a link proves that the person who sets the password owns the account.';

update member set proved_at = now()
  where id in (select member_id from tenant_member group by member_id having count(*) >= 2)
     or id in (select principal_id from binding where scope_type = 'instance' and principal_type = 'member')
     or id in (select principal_id from identity_link where principal_type = 'member');
