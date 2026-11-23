/**
 * Every error code the API answers with, in one place. A code is stable: it
 * keeps its meaning for as long as it is here, and one that is retired is
 * never given another. The control plane can throw only a code that is listed,
 * and the documentation's page of errors, with the help behind an error in the
 * console, is drawn from this list.
 *
 * `title` says what happened in a few words. `help` says what to do about it,
 * in a sentence or two, as Markdown.
 */

export interface ErrorCodeEntry {
  /** The HTTP status it is sent with. A code sent with more than one lists the usual one. */
  status: number;
  title: string;
  help: string;
}

const code = (status: number, title: string, help: string): ErrorCodeEntry => ({
  status,
  title,
  help,
});

export const ERROR_CODES = {
  // What any request can meet.
  bad_request: code(
    400,
    "The request could not be understood",
    "The response says what was wrong with it. Nothing was changed.",
  ),
  validation_failed: code(
    400,
    "Something sent does not fit",
    "The response lists each value that is wrong and why, under `issues`. Fix them and send it again.",
  ),
  unauthenticated: code(
    401,
    "Not signed in",
    "Sign in, or send an API key. A key that was deleted, or a session that ran out, answers the same way.",
  ),
  forbidden: code(
    403,
    "Not allowed",
    "The response names the permission this needs. Someone who manages access gives it by binding a role that holds it.",
  ),
  cross_site: code(
    403,
    "The request came from another site",
    "A change is accepted only from the instance's own pages, or with an API key. Make the request from the console, or send a key.",
  ),
  sso_required: code(
    403,
    "This tenant signs in through its own provider",
    "Sign in through the tenant's single sign-on. A password or an API key made before it was required no longer works here.",
  ),
  not_found: code(
    404,
    "Not found",
    "It is not there, or it is and you may not see it: the two answer the same way on purpose. Check the path and the workspace.",
  ),
  method_not_allowed: code(
    405,
    "The address does not take that method",
    "Check the API's description for the methods the route takes.",
  ),
  conflict: code(
    409,
    "It no longer fits what is there",
    "Something changed since it was read, or it clashes with something that exists. The response says which. Read it again and retry.",
  ),
  payload_too_large: code(413, "Too large", "The response says the limit. Send less, or in parts."),
  unsupported_media_type: code(
    415,
    "The body is of a type the route does not take",
    "Send JSON with `content-type: application/json`, unless the route's description says otherwise.",
  ),
  rate_limited: code(
    429,
    "Too many requests",
    "Wait for the time `retry-after` gives, then try again.",
  ),
  too_many_streams: code(
    429,
    "Too many live connections",
    "One person may keep a few live connections open at once. Close a tab that is no longer needed.",
  ),
  internal_error: code(
    500,
    "Something went wrong on the instance",
    "It is not something you sent. The response carries a `requestId` an operator can find in the logs.",
  ),
  unavailable: code(503, "Not available for the moment", "Try again shortly."),
  busy: code(
    503,
    "The database is busy",
    "The request waited too long for a connection. It is safe to try again after the time `retry-after` gives.",
  ),
  read_only: code(
    503,
    "The database is taking no changes",
    "Its disk may be full, or it is in maintenance. Reading still works. An operator needs to look.",
  ),
  data_location_unavailable: code(
    503,
    "The tenant's database cannot be reached",
    "The tenant's data is kept in a database of its own, and that database is not answering. An operator needs to look.",
  ),
  egress_refused: code(
    400,
    "That address may not be reached",
    "The control plane does not reach private networks for a tenant (an OAuth token address, an identity provider, a Git remote, a data source) unless the operator allows them in `EGRESS_ALLOW`.",
  ),

  // Deploying, promoting and drafts.
  production_workspace: code(
    409,
    "A production workspace changes only by deploy",
    "Make the change in a dev workspace and promote it, or deploy from the repository.",
  ),
  draft_changed: code(
    409,
    "Someone else saved this draft since you opened it",
    "Nothing was overwritten. Reload to see their change, then make yours again.",
  ),
  nothing_to_deploy: code(409, "There are no drafts to deploy", "Save a change first."),
  path_taken: code(
    409,
    "Something else is already at that path",
    "A path belongs to one resource in a workspace, of whatever kind. Choose another path.",
  ),
  kind_changed: code(
    409,
    "A resource cannot become another kind",
    "Remove it and make the new one, or give the new one another path.",
  ),
  rename_suspected: code(
    409,
    "This deploy looks like a rename, written as a delete and a create",
    "It would delete something that holds history or data and make something of the same kind. Give the new one the old one's `key` to keep them, or deploy again confirming the deletion.",
  ),
  incompatible_bundle: code(
    409,
    "The bundle was built for another version",
    "Upgrade the instance, or rebuild the bundle with an SDK this instance runs.",
  ),
  assets_missing: code(
    409,
    "Some of the apps' files were not uploaded",
    "Upload them, then upload the bundle again. `volvel deploy` does both.",
  ),
  bindings_missing: code(
    409,
    "The workspace is missing something the bundle needs",
    "The response lists each connection, secret or variable. Set each one in the workspace, then deploy or promote again. A deploy to a dev workspace goes ahead with a warning instead.",
  ),
  bindings_invalid: code(
    409,
    "Something set in the workspace does not fit what the bundle expects",
    "A connection is of another connector than the bundle uses it as. Set it again, then deploy again.",
  ),
  connector_missing: code(
    409,
    "The connector is not there",
    "A connection names a connector the workspace does not have. Deploy the connector first.",
  ),
  breaking_changes: code(
    409,
    "Promoting this changes a name something outside calls",
    "The response lists each one. Read them, then promote again confirming them.",
  ),
  staged_elsewhere: code(
    409,
    "The upload is no longer held",
    "It was kept by another replica, or was removed. Upload it again.",
  ),
  console_code_off: code(
    403,
    "Writing code in the console is turned off for this tenant",
    "Code is deployed from the tenant's repository. A tenant's administrator can turn the console's editor on.",
  ),
  limit_reached: code(
    409,
    "There are as many as there may be",
    "The response says the limit. Delete one first.",
  ),
  delete_not_allowed: code(
    409,
    "This access change would remove what the repository does not have",
    "If it was made in the console, pull it into the repository first. To remove it, ask again saying so.",
  ),
  principal_in_use: code(
    409,
    "It is still given to someone",
    "Take the role or the group away from everyone who holds it first.",
  ),

  // A tenant's access.
  not_an_approver: code(
    403,
    "You may not answer this",
    "An approval is answered by one of the people the step names, and a change to access by someone other than whoever asked for it.",
  ),
  decide_in_console: code(
    403,
    "Decide this in the console",
    "An app that is written as code could press the button for whoever has it open, so an approval is decided where only the console runs. Open the approval in the console.",
  ),
  own_release: code(
    409,
    "A change to access is approved by someone else",
    "Whoever made the change cannot approve it. Ask a second person who may change the tenant's access.",
  ),
  approval_needs_two: code(
    409,
    "Approval needs two people",
    "Give a second member a role with `access:write`, so that one can answer the other.",
  ),
  release_stale: code(
    409,
    "The tenant's access changed after this access change was asked for",
    "It is no longer the change that was shown. Withdraw it and ask again.",
  ),
  link_expired: code(410, "The link has been used or has run out", "Ask for a new one."),

  // Sign-in and domains.
  secret_needed: code(
    409,
    "The provider has no client secret",
    "Give the client secret before turning the provider on.",
  ),
  domain_needed: code(
    409,
    "No email domain is proved",
    "Prove at least one domain before turning the provider on. Members are signed in only by an email in a domain the provider has proved.",
  ),
  domain_taken: code(
    409,
    "The domain belongs to another tenant",
    "A hostname or an email domain belongs to one tenant of the instance.",
  ),
  domain_not_verified: code(
    409,
    "The domain is not proved yet",
    "Add the DNS record the console shows, then check again.",
  ),

  // Git.
  no_repository: code(
    409,
    "The tenant has no repository",
    "Set one under the tenant's Repository.",
  ),
  no_branch: code(409, "The workspace follows no branch", "Choose one under Workspace settings."),
  repository_unreachable: code(
    409,
    "The repository could not be reached",
    "Check its address and the credentials the tenant keeps for it.",
  ),
  git_busy: code(
    409,
    "Another push or pull of this workspace is going on",
    "Try again in a moment.",
  ),
  git_paused: code(
    409,
    "Sync is paused for this tenant",
    "It was imported from another instance. Check the repository's settings, then turn sync on.",
  ),

  // Runs, triggers and data.
  workspace_paused: code(
    503,
    "The workspace's triggers are paused",
    "The webhook started nothing. Try again once they are resumed.",
  ),
  signature_invalid: code(
    401,
    "The webhook's signature does not match",
    "The sender and the trigger must share the same secret, and sign the body exactly as it is sent.",
  ),
  too_slow: code(
    422,
    "It took too long and was stopped",
    "The response says the limit. Ask for less: narrow the filter, or add an index to the column it searches.",
  ),
  connection_unusable: code(
    422,
    "The connection cannot be used as it is",
    "The response says what is missing or wrong in its settings.",
  ),
  source_unreachable: code(
    502,
    "The data source could not be reached",
    "The outside database did not answer. Check its address and that the instance may reach it.",
  ),
  source_refused: code(
    502,
    "The data source refused",
    "The outside database answered and said no. The response carries what it said: often the credentials, or a table that is not there.",
  ),
  source_slow: code(
    504,
    "The data source took too long",
    "The outside database did not answer in time. Try again, or ask it for less.",
  ),

  // Moving a tenant.
  import_refused: code(
    400,
    "The export file cannot be imported",
    "The response says why: the wrong passphrase, a file from a newer version, or a tenant that is already here.",
  ),
  import_incomplete: code(
    500,
    "The import was undone",
    "What arrived did not match what the file said it held. Nothing of it was kept. Export again and import the new file.",
  ),
} as const satisfies Record<string, ErrorCodeEntry>;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Whether a string is a code the API answers with. */
export const isErrorCode = (value: string): value is ErrorCode => Object.hasOwn(ERROR_CODES, value);
