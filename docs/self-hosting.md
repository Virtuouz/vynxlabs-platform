# Running the platform yourself

Last updated: 2026-11-12

This guide is for whoever operates an instance: Vynxlabs, a client, or another agency. The same image runs everywhere. What differs between a shared instance, a dedicated one and an on-prem site is configuration, never the software.

## What an instance is

| Part | What it does | State it keeps |
| --- | --- | --- |
| Control plane | The API, the console, the scheduler, the queue and the flow engine. One image | None |
| Postgres 16 or later | Platform records, the queue, and tenants' custom tables | Everything except files |
| An S3-compatible object store | Bundles, uploaded files, large payloads | Files |
| Workers | Run tenants' scripts. The control plane starts them, or you run your own | None |

Back up Postgres and the object store, and keep the master key. That is the whole instance.

## Installing on one machine

You need Docker with Compose, and a machine with 2 GB of memory to start.

```sh
git clone <this repository> platform && cd platform
cp deploy/compose/.env.example deploy/compose/.env
```

Fill in `deploy/compose/.env`:

| Setting | What to put |
| --- | --- |
| `POSTGRES_PASSWORD`, `OBJECTSTORE_SECRET` | Long random values: `openssl rand -hex 24` |
| `AUTH_SECRET` | `openssl rand -hex 32`. Signs session cookies |
| `MASTER_KEY` | `openssl rand -base64 32`. Wraps every tenant's encryption key. **Keep a copy somewhere safe.** Without it no stored secret can be read again |
| `PUBLIC_URL` | The address people will type, for example `https://platform.example.com` |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | The first operator. At least 12 characters. Remove both after the first start |
| `PLATFORM_BIND` | Where it listens on the host. Default `127.0.0.1:8080` |

```sh
docker compose -f deploy/compose/compose.yaml up -d --wait
```

The database is created and migrated on the first start. Open the address, sign in as the first operator, and create a tenant.

### Before anyone else can reach it

- Put a reverse proxy that terminates TLS in front of it. The control plane speaks plain HTTP and listens on localhost by default for that reason.
- Set `PUBLIC_URL` to the address behind the proxy. Sign-in checks requests against it.
- If the instance will hold more than one tenant's apps, set `APPS_URL` as well. See [Apps, and the addresses they are served at](#apps-and-the-addresses-they-are-served-at).
- Remove the two `BOOTSTRAP_ADMIN_` lines and restart.

### Using your own Postgres or object store

Leave the bundled services out and point the control plane at yours with `DATABASE_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_FORCE_PATH_STYLE`.

The Postgres user must own its database and be allowed to create roles (`CREATEROLE`). It does not need to be a superuser. The platform makes one extra role per database, which it signs in as for every request for a tenant's rows. That role owns nothing, so row policies apply to it, and nothing run under it can become the owner. Its password is derived from the master key and is never stored.

A managed Postgres with point-in-time recovery is the better choice for anything that matters.

## It never calls home

The platform makes no network call you did not configure: no telemetry, no update check, no license check. The connections it opens are to your Postgres, your object store, the systems a tenant has bound as connections or data sources, and nothing else. It runs with no route to the internet.

## Backups

- **Postgres**: everything. Use your provider's point-in-time recovery, or `pg_dump` on a schedule.
- **The object store**: bundles and files.
- **`MASTER_KEY`**: once, somewhere that is not the same disk.

Take the Postgres and object store backups close together. A database that names a file the store does not have will say so when the file is asked for, and not before.

A tenant can also be backed up by itself, as an export. See below.

## Upgrading

```sh
git pull
docker compose -f deploy/compose/compose.yaml up -d --build --wait
```

- Migrations run on start and move forward only. You can upgrade from any earlier version straight to the newest: the tests do exactly that from every earlier database level.
- There is no downgrade. Take a backup first, and go back by restoring it.
- Bundles that tenants deployed before the upgrade keep running, and can still be redeployed, promoted and rolled back to. Each version states the oldest bundles it still runs, and refuses older ones with a message that says to rebuild.
- Standalone workers should run the same version as the instance. Upgrade the instance first.

## A database of a tenant's own

A tenant's custom tables can live in a database other than the instance's. Its platform records, the queue and sign-in stay where they are.

1. Create an empty database, with a user that owns it and may create roles.
2. In the console, under Instance, Database locations, register it under a name with its connection string. The platform connects, prepares it, and stores the address encrypted with the master key.
3. Give the name when you create a tenant, or when you import one.

A tenant's location is chosen once. To move an existing tenant, export it and import it into the location you want.

If a dedicated database is down, the tenants in it get an error for their tables. Everything else, and every other tenant, keeps working. The Database locations page shows whether each one answers.

A deploy that changes tables in a dedicated database commits there first and in the instance database second. If the instance fails between the two, the workspace shows the earlier bundle while its tables are already changed. Nothing is lost. Deploy the bundle again and it completes.

## Workers in another network

To run a tenant's scripts next to systems the instance cannot reach, run a worker there. A worker only makes outbound HTTPS requests to the instance, so nothing has to be opened towards it.

1. In the console, on the tenant's Workers page, create a credential. Give it a pool, for example `plant`, if only some scripts should run there.
2. In the tenant's repository, give those scripts `worker: "plant"`.
3. On the machine in that network:

```sh
cp deploy/worker/.env.example deploy/worker/.env    # the image, the instance's address, the credential
docker compose -f deploy/worker/compose.yaml up -d
```

A script that names a pool runs only on a worker of that pool. A script that names none runs on the workers the instance starts. To have a tenant run nothing on the instance at all, choose "Run only on our own workers" on its Workers page.

A run that is waiting with no worker connected that could take it says so on its page.

## Moving a tenant

A tenant can be taken out of an instance at any time, and brought into another. This is also how a tenant moves between a shared instance and a dedicated one, and between the cloud and a site.

### Export

A tenant's own admin can do this. An operator cannot, without an access grant the tenant can see.

```sh
export PLATFORM_EXPORT_PASSPHRASE='a long passphrase'
platform tenant export --tenant acme --out acme.tar --history
```

Or in the console, under the tenant's Export page.

The file holds everything the tenant has. Its secrets stay encrypted, and the key travels wrapped with the passphrase, which is not stored anywhere. Pass the passphrase on separately from the file.

The passphrase protects the secrets, not the whole file. The tenant's rows, files, audit log and, with `--history`, every run's input and output are in it as plain JSON. Treat the file like a database backup: keep it where access is controlled, and encrypt it yourself if it has to travel. The format is described in [contracts/tenant-export.md](contracts/tenant-export.md).

### Import

An operator of the instance it is going to does this. Both instances must be at the same version.

```sh
platform login --url https://new.example.com --token <an operator's API key>
platform tenant import acme.tar --location acme-db    # or leave --location out for the instance's own database
```

The whole file is checked before anything is written, and the tenant arrives entirely or not at all.

Then, on the new instance:

1. Sign in as one of the tenant's members. They have the passwords they had. Someone who already had an account there keeps that account and its password.
2. Create new API keys and worker credentials. They are never exported.
3. Point whatever calls the tenant's webhooks at the new address. The part after the host is unchanged.
4. Stop the tenant on the old instance: pause its workspaces' triggers there.
5. Resume the triggers of each workspace on the new instance. They arrive paused so that the two instances never both act.
6. When you are satisfied, delete the tenant on the old instance, from the tenant list. Its audit entries stay there.

### Promotion between modes

Every move between deployment modes is this same export and import. There is no other path, and none is needed.

## Apps, and the addresses they are served at

An app is a tenant's own interface, built from its repository and served by the instance. There are three kinds of address, and an instance can use all of them at once.

### By path, on the instance's address

With nothing configured, an app is at `PUBLIC_URL/apps/<tenant>/<workspace>/<app>/`, and a tenant's sign-in pages at `PUBLIC_URL/portal/<tenant>/`. One hostname and one certificate serve everything, which is what a single machine on a plant network wants.

An app is JavaScript written by whoever writes that tenant's code, and here it runs at the same address as the console. A member who opens it is already signed in to the console there. That is fine where everyone who writes code works for you. Where it is not, use a second address.

### A second address for every app

Set `APPS_URL` to another hostname that reaches the same instance, for example `https://apps.example.com` beside `https://platform.example.com`. Then:

- apps and sign-in pages are served only there, at the same paths. The instance's own address sends anyone who asks for one over;
- the console is not served there, and members cannot sign in there;
- a member's console session is never sent there. Staff who open an app are carried over by a code that works once, and get a sign-in for that tenant's apps only.

This is the setting to use for an instance with more than one tenant. Point the second name at the same proxy, and give the proxy a certificate for it.

### A hostname of the tenant's own

A tenant's admin can register a hostname for one app under **Domains**, such as `portal.acme.com` or `orders.acme.internal`. The app is then at that name's root.

1. **Point the name at the instance.** A CNAME to the instance's hostname, or an address record. For a name that exists only inside a network, an entry in that network's DNS.
2. **Give the proxy a certificate for it.** The platform issues none and never sees one.
   - On Fly.io: `fly certs add portal.acme.com --config deploy/fly/fly.toml`, then create the records it asks for.
   - Behind Caddy: add the name to the site's addresses and Caddy gets the certificate itself.
     ```
     platform.example.com, apps.example.com, portal.acme.com {
       reverse_proxy 127.0.0.1:8080
     }
     ```
   - Behind any other proxy: add the name and its certificate there. For an internal name, a certificate from the network's own authority.
3. **Show that the name's owner agrees.** The Domains page gives a TXT record to create, `_vx-challenge.<hostname>`. Create it and press Check. This stops one tenant on a shared instance from claiming a name that belongs to another.
4. **Enable it.**

An operator can enable a name without the TXT record. That is for a name with no public DNS, where the operator knows whose it is. It is recorded in the audit log.

The proxy must pass the `Host` header through unchanged, and say whether the request came over HTTPS (`X-Forwarded-Proto`), which Caddy and Fly.io both do. Cookies are marked secure when it did.

### What reaches what

| At | The console | The API | A member's console session | Apps |
| --- | --- | --- | --- | --- |
| `PUBLIC_URL` | Yes | All of it | Counts | By path, unless `APPS_URL` is set |
| `APPS_URL` | No | All of it, by API key or app sign-in | Ignored | By path |
| A registered hostname | No | That tenant only | Ignored | The one app, at the root |

## End users

A tenant's end users are its customers and portal users. They are a pool of the tenant's own, apart from members, and the same email in two tenants is two people. Staff add them under **End users**, which makes a link that works once: whoever opens it chooses the password.

- **Mail is optional.** Set `SMTP_URL` and `MAIL_FROM` and the instance sends invitations and reset links itself. Without them it sends nothing, the person who made the link is shown it to pass on, and "Forgot your password" tells people to ask.
- **Sign-up** is off. A tenant's admin can turn it on under **Branding**.
- **What they can reach** is decided by bindings, like everything else: bind the built-in `portal_user` role to `end_users`, or to one end user, at an app and at the tables it shows. A table's owner rule then keeps each person to their own rows. An end user never holds more than what apps use, whatever they are bound to.
- **Files have no owner.** Whoever may read files in a workspace may read all of them, so `portal_user` does not include them.

Someone who is not signed in reaches only what is bound to `anonymous`, and is limited in how often they may ask. The limit is counted by address, in each replica.

## Groups, attributes and row rules for end users

End users have groups of their own, under **End-user groups**. Bind a role to a group once instead of to each person. An end user also has attributes, such as `customer_id`, edited from their row under **End users**.

A table's rows can be ruled by both. Under a table's **Row rules**, say who may read or change a row: everyone, the person a column names, people in the group a column names, or people whose attribute equals a column. **See it as** shows the rows as one end user sees them.

## Apps made in the console

A member can build an app over a workspace's tables with no code, under **Apps made here** in a dev workspace: tables, cards, charts, totals and forms, where choosing a row in one decides what another shows. It is published by deploying, promoted to production like anything else, and then shared from **Apps** with a group or with every end user.

- **Who may build.** Give the built-in role `app_maintainer`. Its holder builds and deploys these apps and nothing else: no script and no flow.
- **Who sees what.** Sharing gives the app and its tables. Which rows each person sees is decided by each table's row rules, so one app can show two groups different rows. Leaving a value off a screen does not keep it from someone who may read the row.
- **Dashboards** are a member's own pages, under **Dashboards** in any workspace: saved without a deploy, private unless shared read-only with the workspace.
- **The image carries the app that draws them.** `SCREENS_DIR` says where it is, and is set in the image. An instance run from source finds it after `pnpm build`. Without it, such an app says it cannot be shown.

## Single sign-on

A tenant's admin connects an identity provider under **Single sign-on**, for members or for end users, over OIDC or SAML. Operators connect one for themselves under **Instance**. The instance needs nothing new to run, and makes outbound requests to the provider: to read an OIDC provider's settings and keys, and to read SAML metadata when given an address for it.

1. **Connect.** Give the OIDC issuer, client ID and client secret, or the SAML metadata as an address or pasted. The provider is created off.
2. **Enter the addresses at the provider.** The console shows them with a button to copy each: the redirect address for OIDC; the reply address, entity ID and metadata address for SAML. They never change for a provider.
3. **Try it.** A try-out opens the provider, signs nobody in, and shows what the provider sent and what would happen.
4. **Prove a domain.** A provider of members signs in only people whose email is in a domain proved with a DNS TXT record, the same record a hostname uses. A provider of end users needs none.
5. **Turn it on.** The console's sign-in asks for the email first and offers the provider by the email's domain. A tenant's sign-in page shows a button for each provider of end users.

Worth knowing:

- **People are found by the provider's own identifier,** never by email after the first sign-in. Send a name ID or subject that lasts.
- **Creating people is off** until turned on for a provider. A new member can be given a default role. Without one they sign in and see nothing.
- **Groups follow the provider.** Map a group the provider sends to a group here, and membership of mapped groups is set on every sign-in. Groups that are not mapped are left alone.
- **Requiring single sign-on** refuses passwords for the people a provider covers. Members bound at the instance, the operators, keep their passwords, so that a broken provider locks nobody out for good. Keep one such account.
- **SAML requests are signed** with a key made for each provider, unless that is turned off. SHA-1 signatures and sign-ins begun at the provider are refused unless turned on for a provider.
- **Encrypted assertions** are opened when the provider wraps the key with RSA-OAEP and MGF1 (`rsa-oaep-mgf1p`) and the SHA-1 digest. Keycloak's defaults differ: set the client's key transport algorithm and digest. The certificate to encrypt to is in the metadata only when **Ask the provider to encrypt assertions** is on.
- **An imported tenant's providers are paused.** Give the provider's administrator this instance's addresses, prove the domains again, and save the provider.
- **Not built:** SCIM, single logout, and one provider shared by several tenants.

To try it locally, the development stack has Keycloak behind a profile, with a realm of two people, `ada` and `ben`, and an OIDC client `vynxlabs-platform` whose secret is `dev-only-oidc-secret`:

```
docker compose -f deploy/compose/compose.dev.yaml --profile sso up -d keycloak
```

The issuer is `http://localhost:8180/realms/acme`. For SAML, give `http://localhost:8180/realms/acme/protocol/saml/descriptor` as the metadata address, then in Keycloak import a client from the provider's metadata address shown in the console.

## Branding

A tenant sets its colours, corner radii, fonts and logo under **Branding**. They apply to its apps, its sign-in pages and the console while that tenant is open. A workspace can override them with a theme in its repository. Values are plain colours, lengths and font lists: nothing that could load a file from elsewhere.

## Environments inside a tenant

- A dev workspace is linked to the workspace it promotes to. Promoting activates there the same bundle that runs here, without rebuilding it. `platform promote --preview` shows what would change first.
- A workspace can be cloned into a new dev workspace, with or without its rows and files. By default the clone gets no connection, data source or secret value and its triggers are paused, so it cannot act on a real system. Turning that safety off is recorded in the audit log.
- A workspace's triggers can be paused at any time.

## When something is wrong

| What you see | What to look at |
| --- | --- |
| The container restarts on start | Its log. A missing or malformed setting is named there |
| `/api/v1/readyz` answers 503 | The body says whether Postgres or the object store is unreachable |
| "The database is newer than this version" | An older image was started on a newer database. Start the newer image |
| A tenant's tables answer 503 | Its dedicated database. See the Database locations page |
| Runs stay queued | The run's page says what it is waiting for. Otherwise the instance log, for the worker it tried to start |
| An import is refused | The message names the reason: the passphrase, the version, a damaged file, or a slug already taken |
| An app's address answers "Nothing here" | Whether the workspace has a deployed bundle with that app, under the workspace's Apps tab |
| A registered hostname shows the console | It is not enabled, or the proxy rewrites the `Host` header |
| Staff sign-in from an app loops back to the console | The app's address is not `APPS_URL` or an enabled hostname of that tenant |
| Invitations are not arriving | `SMTP_URL` and `MAIL_FROM`, and the instance log, which names the address that could not be sent to |
