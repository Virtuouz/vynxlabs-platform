/**
 * An audit action in plain words. Actions are written `subject.verb`, such as
 * `end_user.signed_in` or `app_domain.enabled`; this reads them as a sentence
 * fragment: "End user signed in", "Hostname enabled". The code itself stays
 * the record and is shown beside it where precision matters. The words are the
 * manifest package's, which the reference's page of actions is drawn from too.
 */
export { actionWords, targetTypeWords } from "@volvel/manifest";
