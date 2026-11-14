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

const words = (text: string) => text.replace(/[_-]+/g, " ").trim();

export function actionWords(action: string): string {
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
