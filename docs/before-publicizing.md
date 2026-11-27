# Before Volvel is made public

Written: 2026-11-26, after phase 35 (its record is in the private repository `volveldev/volvel-internal`, as are the other documents named below).

This lists what stands between the product as it is and telling people to choose it. It holds
blockers only: things that would stop a developer, an administrator, a leader or an agency from
choosing the software, or that would embarrass a claim made in public. Smaller faults are in the
phase documents.

Each blocker is tracked as an issue, and each step of the suggested order at the end as a milestone: see the [Before publicizing](https://github.com/volveldev/volvel/issues?q=label%3A%22priority%3A+p0%22) issues. This page is the reasoning. What is done and what is next is on the issues, not here.

Each item says how it is known. "Measured" and "proved" mean phase 35 ran it. "Read" means it was
found by reading the repository and not run. "Not assessed" means nobody has looked.

## What has to be true first, for anyone

| # | Blocker | How it is known | What closes it |
|---|---|---|---|
| 1 | **Nothing can be installed.** No package is on npm, no image is on Docker Hub and there is no release. The only way to run Volvel is to build it from source. The version is 0.5.0 | Read: the README says so, and both registries were asked on 2026-11-26 | A first release: `@volvel/sdk`, `@volvel/cli` and the others the docs name, the image `volvel/volvel`, a tag and release notes |
| 2 | **No promise about upgrades.** The rule so far has been that nothing is owed to earlier versions. Phase 35 alone refused an archive format, changed a built-in role and tightened what a schema pattern may be | Read: `CHANGELOG.md`, and the owner's standing decision | A written policy before the first release: what a version number means, what may break in which kind of release, how long a migration path is kept, and where a breaking change is announced |
| 3 | **One internal review is the only security review.** Phase 35's review found one critical and five high faults. Its second pass broke five of the first fixes. The fixes made after the second pass were not attacked again, and about a dozen low findings were never looked at again | Measured, and recorded in `documentation/fixed/p35-rt-*.md` | A review by someone outside, after items 4 and 5; and a pass over the low findings that were left |

## For an agency or anyone hosting tenants who do not trust each other

| # | Blocker | How it is known | What closes it |
|---|---|---|---|
| 4 | **Apps written as code share one address.** One tenant's app can act as a visitor who is signed in to another tenant's app: read its pages and rows, and write. Where apps are at the console's address and the visitor is a member of staff, the app's script can also call the console's API as that person | Proved in a browser in both modes. Written into `SECURITY.md` | The apps isolation phase. The owner's decisions for it are in phase 35's document under "Set aside for later": pages served sandboxed, a short-lived token in place of the cookie, nothing kept in the browser, files fetched by a name made from their content, staff acting with what apps use and no more, an app with its own hostname no longer served at the shared address. Until then: only the operator deploys app code, or each such tenant has a hostname of its own |
| 5 | **A tenant's code is not shown to be kept in its box.** A script is a process of its own, held to its time and its memory, and that is all that was loaded and attacked: in that mode every tenant's scripts run as one user of the operating system. The stronger mode, a worker host that gives each tenant's worker a user of its own and refuses private addresses, has never been started on Fly, and whether Fly runs it as root, which it needs, is not known | Read: `self-host/how-to/running/install-on-fly.md` says so. Phase 35 ran `process` mode only | **Code sandboxing, proved.** Run the worker host in a real deployment, on Compose and on Fly, under the load and the attacks of phase 35: one tenant's script against another's files, processes, memory and network, and against the control plane's secrets. Write down what held, and make that mode the one the docs tell a host of several tenants to use. A stronger box than a user of its own is under "Nice to have" |
| 6 | **An end user's email address is never proved.** Anyone can sign up to an app with any address, with mail set up or without. An app that shows a person the rows that carry their address shows them to whoever typed it | Read in the code and written into the docs in phase 35 | Proof of the address at sign-up where mail is set up, and a way for a row rule to tell a proved address from an unproved one |

## For an administrator

| # | Blocker | How it is known | What closes it |
|---|---|---|---|
| 7 | **There is no way to see how an instance or a tenant is doing, or why something is not running.** There is one set of figures, for the whole instance, at one address behind a token. Nothing is counted for a tenant. A script that does not start gives no reason: slots, a tenant's share, the memory floor and what is counted against it all look the same. A deploy's cost is not recorded. Phase 35's faults were found over SSH | Measured: the list of what could not be seen is in phase 35's findings | Three pieces, in this order. **Figures for each tenant**: runs started, finished and failed, time waited in the queue, what its scripts held in memory (`run.peak_memory_mb` is kept and shown nowhere), requests and their time, rows read, what was refused and why. **A reason for waiting**, counted: no slot, the tenant's share, memory, a full queue. **Dashboards of those figures**, one for the instance and one for each tenant, made of the dashboard pieces the product already has (the chart, goal, pivot and list widgets of `packages/widgets-core`), so that an operator and a tenant's admin read them where they read their own dashboards, and so that the product is seen to use what it sells. Health that answers for the instance, a tenant and one resource, and the same through MCP for an agent that watches on someone's behalf, follow from the figures |
| 8 | **Restoring files has not been tried.** The restore that was timed used the same bucket as the instance it came from. Bringing back an object store from a copy, together with the database, was not run on Fly | Measured, and said in phase 35's faults table | One restore of database and files together into a clean bucket, timed, with the page that describes it corrected by what happened |

## For a leader deciding whether to depend on it

| # | Blocker | How it is known | What closes it |
|---|---|---|---|
| 9 | **Only one machine has been proved.** More than one control plane is described in the docs and has never been loaded or broken. What can be claimed today is that one machine comes back by itself: 53 s after it is killed, 7 s after its database is | Measured, on one machine | Two control planes under the load of phase 35, with one killed, and a restart of each in turn during traffic. Then an honest sentence about availability |
| 10 | **What it carries is known for one small size.** The figures are for one dedicated CPU and 2 GB, with 24 tenants. Scripts that return at once reach about four a second on a machine, because each run is a new process. A tenant's export has not been run past 20 MB | Measured | The same scenarios on two larger sizes, so that the sizing page can say what more hardware buys; one export and import of several gigabytes |

## Nice to have

Not blockers: nobody would turn the product down for want of these. They are here because each
makes one of the blockers above easier to close or better once closed.

| What | Why it helps | Fits with |
|---|---|---|
| **Service accounts of the instance.** A service account belongs to one tenant today (`service_account.tenant_id` is required), so nothing but a person can hold a role at the instance. An instance's own account, with a key and roles that reach the instance or the tenants an operator names, would let a monitor, a deploy pipeline or an agent do an operator's routine work without an operator's sign-in, and be seen doing it in the audit log under its own name | The dashboards and the MCP health of item 7 want a caller that is not a person. An agency that looks after many tenants wants one key for its tooling and not one for each tenant. It needs the same care as an operator: a grant on a tenant before it reads that tenant's data, and nothing it could give that it does not hold | 7, and the agency's work in 4 and 5 |
| **A stronger box for a script than a user of its own.** A box for each run with no view of the machine's other processes, its own file system and a filter on what it may ask the kernel for, or a small virtual machine for each tenant's worker | It turns "a tenant's script cannot reach another's" from a property of users and file modes, which phase 35 found one way through, into one that rests on the kernel or on hardware. It also bounds what a fault in the worker host itself would cost | 5, after the worker host is proved |
| **A full-screen view of a dashboard**, with nothing around it and a turn through several | A wall screen in an operations room or an agency's office is how these figures are mostly looked at | 7 |
| **A small store in the app runtime for what a person chose.** The owner decided that what apps keep in the browser today (the tab a widget was on, a folded section, a chosen clinic in the example) is dropped when apps are isolated, and not replaced | It would give those back, and carry them from one device to another, at the cost of a route any visitor can write to | 4, after it |
| **The docs picture of the import screen with its choice of passwords able to be ticked.** The scene exports and imports on one instance, where every account exists already, so the box is shown as it is when there is nothing to bring | A picture of the control as most people will meet it | The first release's pictures |

## Not assessed

Nobody has looked at these for this document. Any of them may hold a blocker.

- Whether a newcomer gets from nothing to a working app by following Get started alone.
- Accessibility of the console and of apps beyond what the polish gate checks.
- Which browsers are supported, and whether that is tested.
- Support, pricing, a way to report a fault and an answer time: anything a leader signs.
- Whether the licence of every dependency suits how Volvel will be distributed.

## The order suggested

1. A first release with an upgrade policy (1, 2). Nothing else can be said in public before it.
2. Apps isolation (4).
3. Code sandboxing proved: the worker host in a real deployment (5).
4. Figures for each tenant and a reason for waiting, then the dashboards of them for the instance and for each tenant (7). Service accounts of the instance belong with this step if the dashboards or an agent are to read without a person's sign-in.
5. Proof of an end user's address (6).
6. Two control planes, larger sizes, a restore with files (8, 9, 10).
7. An outside review, once 2 and 3 are in (3).

After step 1 Volvel can be shown to people who will run it for their own organization and write
its app code themselves. Steps 2 and 3 are what an agency with unrelated customers on one instance
needs before it is told that is safe, and step 4 is what it needs to look after them.
