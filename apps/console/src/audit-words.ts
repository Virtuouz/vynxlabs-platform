/**
 * An audit action in plain words. Actions are written `subject.verb`, such as
 * `end_user.signed_in` or `app_domain.enabled`; this reads them as a sentence
 * fragment: "End user signed in", "Hostname enabled". The code itself stays
 * the record and is shown beside it where precision matters.
 */
const SUBJECTS: Record<string, string> = {
  app_domain: "Hostname",
  access_grant: "Operator access",
  api_key: "API key",
  end_user: "End user",
  end_user_group: "End-user group",
  flow_run: "Flow run",
  identity_provider: "Identity provider",
  instance: "Instance",
  member: "Member",
  operator: "Operator",
  portal: "Portal",
  run: "Run",
  scim: "Provisioning",
  service_account: "Service account",
  sso: "Single sign-on",
  trigger: "Trigger",
  workspace: "Workspace",
};

const VERBS: Record<string, string> = {
  access: "opened the tenant",
  logo_set: "logo set",
  logo_removed: "logo removed",
  recovery_code_used: "used a recovery code",
};

// The stored action keeps `cancelled`; what is read says `canceled`.
const words = (text: string) =>
  text
    .replace(/[_-]+/g, " ")
    .replace(/\bcancell/gi, (one) => one.slice(0, 6))
    .trim();

/** Actions whose stored name keeps a word the console no longer uses: access changes were releases. */
const WHOLE: Record<string, string> = {
  "access.released": "Access change applied",
  "access.release_requested": "Access change asked for",
  "access.release_declined": "Access change declined",
  "access.release_withdrawn": "Access change withdrawn",
  "access.release_superseded": "Access change superseded",
  "access.approval_changed": "Approval of access changes changed",
};

/** What a kind of target is called, from its stored name: "tenant_release" is an access change. */
export function targetTypeWords(type: string): string {
  return type === "tenant_release" ? "access change" : type.replace(/_/g, " ");
}

export function actionWords(action: string): string {
  const whole = WHOLE[action];
  if (whole) return whole;
  const at = action.indexOf(".");
  if (at < 0) return capitalize(words(action));
  const subject = action.slice(0, at);
  const verb = action.slice(at + 1);
  const who = SUBJECTS[subject] ?? capitalize(words(subject));
  const what = VERBS[verb] ?? words(verb.replace(/\./g, " "));
  return `${who} ${what}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
