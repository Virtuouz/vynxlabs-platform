/**
 * Why a single sign-on was refused, in words for the person it happened to. One list, read by
 * the control plane when it refuses (what an app's sign-in page says) and by the console's
 * sign-in screen (what it says when sent back), so that a reason reads the same in both.
 */
export const SSO_REFUSAL_REASONS = [
  "provider_off",
  "provider_error",
  "invalid_answer",
  "replayed",
  "expired",
  "no_subject",
  "no_email",
  "email_unverified",
  "domain_not_proved",
  "email_not_trusted",
  "no_account",
  "not_in_tenant",
  "disabled",
  "runs_instance",
] as const;
export type SsoRefusalReason = (typeof SSO_REFUSAL_REASONS)[number];

export const SSO_REFUSAL_WORDS: Record<SsoRefusalReason, string> = {
  provider_off: "That way of signing in is turned off. Ask your administrator.",
  provider_error: "The identity provider did not sign you in. Try again.",
  invalid_answer:
    "The identity provider's answer could not be accepted. Try again, and if it happens again tell your administrator.",
  replayed: "That sign-in was already used. Start again.",
  expired: "That sign-in took too long or was already used. Start again.",
  no_subject:
    "The identity provider did not say who you are. Tell your administrator: the provider's settings need a look.",
  no_email:
    "The identity provider did not send your email address. Tell your administrator: the provider's settings need a look.",
  email_unverified:
    "The identity provider says your email address is not verified. Verify it there, then try again.",
  domain_not_proved:
    "Your email address is not in a domain this sign-in is set up for. Ask your administrator.",
  email_not_trusted:
    "Your account is tied to a different identity at the provider. Ask your administrator to untie it.",
  no_account: "There is no account here for you yet. Ask your administrator for one.",
  not_in_tenant: "Your account has not been added here yet. Ask your administrator to add you.",
  disabled: "Your account has been turned off.",
  runs_instance:
    "Your account runs this instance, and this sign-in does not open it. Use your password, or the instance sign-in.",
};
