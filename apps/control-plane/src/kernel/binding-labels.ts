/** What the joins of a binding's principal found: the name or email of whoever it is. */
export interface PrincipalNames {
  principal_type: string;
  email: string | null;
  end_user_email: string | null;
  group_name: string | null;
  end_user_group_name: string | null;
  account_name: string | null;
}

/**
 * How a binding's principal is called wherever bindings are listed: a person by their email, a
 * group or an account by its name, and the two open audiences by what they are.
 */
export function principalLabel(row: PrincipalNames): string {
  return (
    row.email ??
    row.end_user_email ??
    row.group_name ??
    row.end_user_group_name ??
    row.account_name ??
    (row.principal_type === "end_users" ? "every end user" : "anyone")
  );
}
