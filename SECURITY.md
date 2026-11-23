# Security

## Reporting a problem

Please report a suspected vulnerability privately, and not in a public issue. Say what you found, how to reproduce it, and which version you tested.

The address to write to, and how quickly a report is answered, are to be set by the owner before the first public release.

## Supported versions

The newest minor version and the one before it get fixes for security problems. Older ones do not: upgrade. The date of the first public release is not set yet, and until it is, nothing has been published to be supported.

## Two rules

Decision 0001 (`docs/evolution/decisions/0001-execution-boundary.md`) sets where a tenant's code runs and what the control plane reaches on a tenant's behalf.

1. **The control plane never runs a tenant's code.** It does not import a bundle, evaluate a tenant's expression with access to anything but the data it is given, or load a tenant's connector. Work that needs a tenant's code, such as reading the schema a script declares, is a task that one of the tenant's workers does, in a process of its own.
2. **The control plane reaches a destination a tenant chose only through a named list, behind an egress guard.** The list: an identity provider's metadata and endpoints, a Git remote, a data source, the token address of an OAuth connection, and the check of a registered hostname. The guard refuses loopback, private, link-local (cloud metadata included), shared and reserved addresses, checked on the address actually connected to and on every redirect. `EGRESS_ALLOW` lets an operator allow an internal network or host. Anything else a tenant's systems are asked, such as posting a failure alert through a connection or trying a connection, is a task for a worker.

## What the platform protects, and how

| What | How |
| --- | --- |
| A tenant from another tenant | Every platform row carries its tenant's ID, and every request is checked against it by one authorization function. A request for another tenant's ID answers 404 |
| A tenant from the operator | An operator has no access inside a tenant by default. Access is a time-limited grant with a reason, which the tenant's admins can see and end, and everything done under it is audited |
| Secrets at rest | Each tenant has its own key, wrapped by the instance master key. Secret values, connection credentials, data source passwords and webhook tokens are encrypted with it, bound to the tenant, workspace and name they belong to. The master key can be rotated without downtime; a rotation rewraps the tenants' keys and the instance's own sealed values, never tenants' secrets one by one |
| A person's rows from another person | Postgres row-level security on every custom table. Requests for rows run on a database sign-in that owns nothing and cannot become the role that does |
| The console from a tenant's app | A member's console session counts only at the instance's own address. At an app's own address a member has a separate sign-in, good for that tenant and for what apps use, and nothing else |
| A tenant's staff from its customers | End users are a pool of each tenant's own. Whatever role an end user is bound to, the authorization check gives them only the kinds of permission apps use |
| A sign-in through an identity provider | An OIDC ID token's signature, issuer, audience, expiry and nonce are checked, with PKCE on the exchange. A SAML answer must be signed, be for this instance and this address, be in its validity window, answer a request this instance made, and not have been used before. A sign-in ends in the browser that began it |
| An account from someone else's identity provider | A person is found by the provider's own identifier. An email ties an account to a provider once, and for a member only when its domain was proved to this instance in DNS. One proved domain of members belongs to one provider |
| A change from another site | A request that arrives with a cookie and changes something must come from a page of the address it was sent to |
| What happened | Every change by a person or a key goes through one write path that records an audit entry in the same transaction. Audit entries cannot be changed or deleted one by one. A whole month is removed by the retention pass once it is past every tenant's period, and only after it is exported to the object store |
| The instance and a worker's credential from a tenant's script | Each attempt of a script runs in a process of its own, with a memory limit, and is ended at its time limit or when canceled, whatever it is doing. That process is never given the worker's credential: every call it makes goes through the worker, which makes it only for the script's own run. Workers the instance starts run in a worker host, a container of its own on a network that reaches the control plane and the internet and not the database or the object store, each as a user of its own, the next free one of a range (from uid 10001) with a private directory of its own, so that one tenant's script can neither read nor signal another's. With `NET_ADMIN` the host also refuses them private and link-local addresses, cloud metadata included, other than the control plane, the name servers and what the operator lists in `WORKER_EGRESS_ALLOW`. Without a worker host, the instance starts workers beside the control plane only for tenants whose code only the operator writes |
| The instance's network from a tenant's choice of address | The egress guard above. A data source, a Git remote or an identity provider at an internal address is refused unless the operator allowed it |
| A decision by mail | An approval link is one approver's own, used once, for 48 hours at most and never past the step's timeout, and it stops working when anyone decides. Opening it decides nothing; deciding is a separate request. Whether the approver may still decide is checked when it is used, and the decision is audited as theirs, marked as made from the mail. Only a hash of each link is stored. A forwarded link can be used once by whoever holds it |
| A tenant's exit | An export holds everything the tenant has. Its secrets stay encrypted, and the key travels wrapped with a passphrase that is not stored |

## What it does not protect against

- **Code a tenant deploys, from everything its worker can reach.** A script's process runs as its worker's user, with no further sandbox: it can reach the network, and the files that user can read. Where the kernel's ptrace protection is off (`kernel.yama.ptrace_scope` 0), it could also read its worker's memory, credential included; a worker warns at start when that is so. Sandboxing for code from authors the operator does not trust is not built. Run a tenant you do not trust on a worker of its own, on a machine of its own.
- **Workers the instance starts beside the control plane.** With `MANAGED_WORKERS=process` they share the control plane's network, and, with `MANAGED_WORKER_USER=same` or where the container may not switch users, its user too, so a script could reach what the control plane reaches and read its environment. The instance starts them only for tenants whose code only the operator writes. That is the trust model where only the operator writes code.
- **A worker host without `NET_ADMIN`.** Its network keeps workers from the instance's own services, and nothing keeps them from link-local addresses the container can reach, such as a cloud's metadata service. Give it `NET_ADMIN`, or block those addresses at the host.
- **DNS that changes between a check and a connection, for a data source.** The guard checks a data source's host before each pool connects; a name that answers differently a moment later is not checked again. Requests over HTTP are checked on the address connected to.
- **An operator with access to the database, the master key or the host.** Such a person can read everything. Use a dedicated instance where that matters.
- **A lost master key.** Nothing encrypted can be recovered without it.
- **A tenant's app, where an operator put it on the console's address.** Apps written as code are served only at `APPS_URL`, never where the console's sign-in is. With `APPS_ON_CONSOLE_ADDRESS=true` and no `APPS_URL`, an operator chooses to serve them there, and an app then runs as whoever opens it, with their console session. That is the trust model where everyone who writes code works for the operator.
- **A column, from someone who may read the row.** Row rules decide which rows a person is given. Nothing decides which columns. An app made in the console that leaves a value off the screen has not kept it from anyone: whoever may read the row can ask the API for it.
- **Files, between end users.** A file has no owner. Whoever may read files in a workspace may read all of them. The built-in role for end users does not include files.
- **A tenant's identity provider, for the people in its domains.** Whoever controls a provider a tenant has connected, and a domain the tenant has proved, can sign in as any member with an email in that domain, in every tenant that member belongs to. That is what proving a domain means. A member who must not be reachable that way should not use an address in a domain another organization controls.
- **A provider's word on an end user's email, where a tenant chose to take it.** A provider of end users can be told to tie existing accounts by an email whose domain was not proved. Only turn that on for a provider that verifies emails itself.
- **A sign-in the provider begins.** When that is turned on for a SAML provider, a sign-in answers no request and is tied to no browser, so someone can be signed in as another person by a link. It is off unless turned on.
- **A flood from many addresses.** Guests, webhooks and sign-ins are limited per address, counted in the database across every replica. The address is the one your proxy saw: set `TRUSTED_PROXIES` to match the proxies in front of the instance. Many addresses each stay under the limit. Put a proxy with its own limits in front of a public app.
- **SQL injection, as a second line of defense.** No route runs SQL that changes anything, and every statement on tenant data is built from checked names and bound values; the queries a person writes run read-only. Row-level security guards against mistakes in that code. Whoever could run their own SQL on the row connection could claim to be someone else.

## Defaults worth knowing

- The control plane listens on localhost and speaks plain HTTP. Put a TLS-terminating proxy in front of it.
- It makes no outbound call that was not configured: no telemetry, update check or license check.
- It sends mail only when `SMTP_URL` is set: invitations, password resets and approval mail.
- Checking a registered hostname looks up one DNS record and asks that hostname for one fixed address on this instance. The answer is compared and never shown.
- End users cannot create their own accounts until a tenant turns that on.
- Provisioning over SCIM is off until someone makes a token for a provider. A token opens that one provider's SCIM address and nothing else, is stored as a hash, and can be given an expiry and revoked. A push never deletes an account, never sets a password, and creates a member only for an email in a domain the provider has proved.
- Single sign-on is off until a tenant connects a provider, and a provider is created off. Creating people on first sign-in, SHA-1 signatures, sign-ins begun at the provider and requiring single sign-on are each off until turned on, and each is audited when it is.
- The control plane reads an identity provider's settings, keys and metadata from the addresses a tenant's admin gives, as it reaches a repository a tenant connects, behind the egress guard.
- An app's pages are served with a content security policy that allows no inline script and nothing from another site. The platform's own sign-in pages have no script at all.
- A member's console session lasts 7 days from signing in, and an end user's session lasts 30 days. A member signed in at an app's own address has a session of 12 hours there.
- Passwords of members and end users are hashed with scrypt. Session and link tokens are stored as SHA-256 hashes.
- Binding a connection lets the tenant's workers reach the address a tenant admin chose; the control plane never does. Binding a data source lets the control plane reach it, behind the egress guard.
