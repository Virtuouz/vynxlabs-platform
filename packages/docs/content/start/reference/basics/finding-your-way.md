---
title: Finding your way
description: "Every part of the console's frame: the rail, the section panel, the header, the switchers, the palette, the account menu, the strips and notices, and how it changes by width."
subjects: [navigation, palette]
---

The console is a frame around every screen: a rail on the left, a panel of sections beside it, a header across the top and the screen in the middle. This page lists each part, what it shows and when it changes. The keys are on [the shortcuts page](shortcuts); the numbers, on [the limits page](limits).

::screenshot{name=start/basics-finding-your-way alt="A workspace's Runs screen with the rail, the section panel, the header with the workspace switcher and the palette button."}

## The rail

The narrow bar on the left, from 768 px wide. Below that it is in the menu drawer.

| Item | Where it goes |
| --- | --- |
| The product mark | Your list of tenants (`/`). |
| **Overview** | The workspace overview. |
| **Build**, **Operate**, **Data**, **Configure** | They show their sections and go nowhere. Press again, press elsewhere, or press :kbd[Esc] to put them away. |
| **Tenant** | The tenant's own screens. |
| **Tenants** (members) or **Instance** (operators) | Your tenants, or the instance's screens. |
| The theme button | **Color theme**: **Match the system**, **Light** or **Dark**. |
| The account button | The account menu. |

Inside a tenant but outside a workspace the five workspace items are dimmed and use the workspace you were last in, on this browser.

## The sections

The panel beside the rail, from 1024 px wide, lists the screens of the area you chose. Where it is not docked the same list comes out over the page beside the rail. **Hide navigation** and **Show navigation** fold it; the choice is one of your settings. **Filter** narrows its list by what you type. A person who reaches only a resource inside a workspace has no section list.

| Area | Screens |
| --- | --- |
| Build | **Flows**, **Scripts**, **App Builder**, **Apps**, **Extensions**, **Documentation**, **All resources** |
| Operate | **Runs**, **Events**, **Triggers**, **Approvals**, **Deploy** (**Versions** in a production workspace), **Git sync** |
| Data | **Tables**, **Queries**, **Data sources**, **Dashboards**, **Files** |
| Configure | **Connections**, **Variables**, **Secrets**, **Alerts**, **Workspace settings** |
| Tenant: Work | **Overview**, **Workspaces**, **Approvals** |
| Tenant: People and access | **Members & access**, **End users**, **Service accounts**, **Operator access** |
| Tenant: Sign-in | **Single sign-on** |
| Tenant: Delivery | **Branding**, **Domains**, **Repository**, **Workers** |
| Tenant: Governance | **Audit log**, **Retention**, **Export** |
| Instance (operators) | **All tenants**, **All members**, **Operators**, **Single sign-on**, **Database locations**, **Import a tenant**, **Triggers**, **Health**, **Audit log**, **Console branding**, **Component kit** |
| Account | **Account** |

Some entries carry a count at the right: "{n} failed" on **Runs**, "{n} draft(s)" on **Deploy**, "conflict", "ahead" or "behind" on **Git sync**, "{n} not set up" on **Connections**; on the tenant's screens a number of workspaces, approvals and members, "{n} active" on **Operator access**, "{n} to fix" on **Domains** and "{n} online" on **Workers**. A count you may not read is left out.

In a workspace the panel ends with **Deploy path**: **Draft** and its number of changes, **This workspace** with "v{N}" or "nothing deployed", and the workspace it promotes to with its version and "same" or "differs".

## The header

| Part | What it does |
| --- | --- |
| **Open the menu** | On a phone, opens the drawer with the areas, the sections, **Deploy path**, the account and the theme. |
| **Show navigation** | Where the panel is hidden, brings it back. |
| The tenant's name | A link to the tenant. Shown from 1024 px. |
| **Switch workspace** | Inside a workspace: the workspace's name opens a list of the tenant's workspaces, each with its tag. Choosing one keeps you on the same object when it exists there, otherwise on the same section; a list's filters go with you. |
| **Switch tenant** | Inside a tenant but outside a workspace: the tenant's name opens a list of your tenants and **All tenants**. |
| The environment tag | **Dev** or **Production**. |
| **Paused**, **Paused by the instance** | When the workspace's triggers are held, or an operator holds every trigger. |
| "promotes to {name}" | The workspace this one promotes to, as a link. |
| The path | The section, and what is open in it, as breadcrumbs. On a phone a chevron, **Back to {section}**, goes to the list. |
| The operator mark | After you pressed **Hide** on an operator access grant's strip. It shows the role and when the grant ends. Its menu has **Show the notice** and **End access now**. |
| **Live** | Whether run events are arriving: **Live**, **Connecting…**, **Reconnecting…** after a few seconds without events, or **Offline · last updated {time}**. The instance allows at most 5 such streams open at once. |
| "{n} drafts Review" | A link to the review of the drafts, from 1024 px. |
| "{n} failed runs" | A link to the failed runs. |
| **Help for this page** | Opens the help (:kbd[F1]). |
| **Search or jump to…** | Opens the palette (:kbd[⌘K]). |

Outside a tenant the header says the product's name, or your email on **Account**, and a tag: **Instance · operator** or **Personal**. The title of the browser tab reads: the object, the section, the workspace or tenant, the product.

A production workspace shows an amber rule under the header on every screen. An operator working under an access grant sees a strip under the header with the role, when it ends and why, and the buttons **End now** and **Hide**; after **Hide**, the operator mark in the header brings it back.

## The account menu

| Item | What it does |
| --- | --- |
| "Signed in as {email}" and **Account** | Open **Account**. |
| **What I may do here** | Inside a tenant. Opens your own member page, which lists what you hold and where it comes from. It needs no permission to read access. |
| **Help for this page** | Opens the help. |
| **Keyboard shortcuts** | Opens the sheet. |
| **Sign out** | Asks first if a screen has unsaved changes. |

## The palette

:kbd[⌘K] or **Search or jump to…** opens the dialog **Go to**. With nothing typed it lists the commands of the object that is open, **Pinned**, **Recent**, 12 screens and 4 actions. Typing finds, by every word you type, in groups.

| Prefix | Looks for |
| --- | --- |
| none | Everything the tenant has, and screens, and actions. |
| `>` | Runs, by 8 or more hex characters of the ID, or `tag:` and a tag. |
| `#` | Resources, by path. |
| `/` | Actions. |
| `@` | People, by name or email. |

Search finds, by path: scripts, flows, apps, App Builder pages, tables, triggers, schedules, connections, events, pages of documentation, variables, saved queries, data sources, and secrets by name (never a value). Each kind is asked of what you may read: `script:read`, `flow:read`, `app:read`, `interface:read`, `table:read`, `trigger:read` (also for schedules), `connection:read`, `event:read`, `doc:read`, `variable:read`, `resource:read` (for saved queries), `data_source:read`, `secret:read`, `run:read` and `flow_run:read` for runs, and `member:read` and `end_user:read` for people, in a tenant. A search returns up to 20 results.

| Action | Where |
| --- | --- |
| **Run script…**, **Start flow…**, **Pause trigger…**, **Resume trigger…**, **Copy workspace ID** | In a workspace. |
| **New script**, **New flow** | In a dev workspace. |
| **Switch workspace…** | In a tenant with more than one workspace. |
| **Switch to dark theme** or **Switch to light theme** | Everywhere. |
| **Open the API description** | Everywhere. Opens `/api/v1/openapi.json` in a new tab. |
| **Help for this page**, **Keyboard shortcuts** | Everywhere. |

Keys in the palette: :kbd[↓] and :kbd[↑], :kbd[Enter] to open, :kbd[⌘↵] for the second action of a result (**Run**, **Start**, **Run again**), :kbd[⌘P] to pin or unpin, :kbd[Backspace] on an empty box to leave a picker. **Pinned** holds up to 12 for each tenant; **Recent** keeps 20 for each tenant, shows 8, and keeps only what you opened as a member. **Recent** holds scripts, flows, tables, App Builder pages, apps, connections, events, pages of documentation, variables, saved queries, data sources, triggers, schedules and runs. It does not hold a draft that was never deployed.

States: "Searching…" after 300 ms with nothing to show, "Nothing matches “{text}”.", "Type to find something.", and "The search failed. What is typed may still be there; try again." with a Request ID and **Try again**.

## How it changes by width

| Width | What changes |
| --- | --- |
| Under 768 px | No rail. **Open the menu** opens a drawer. The help takes the screen. |
| 768 px and up | The rail. The sections come out over the page when you press an area. |
| 1024 px and up | The section panel is docked, and the tenant's name and promotion appear in the header. |
| 1280 px and up | An inspector docks beside a list; the help docks beside the page, unless an inspector is docked, when it lies over until 1680 px. |

## Strips and other screens

| What | When | Says |
| --- | --- | --- |
| **The instance is read only.** | The database takes no changes. The console asks every 30 seconds. | "The database is taking no changes for now: its disk may be full, or it is in maintenance. Reading still works. An operator of this instance can look at its Health screen or run `volvel status`." Every Save and create button is off with that reason. |
| **Nothing here** | An address the console has no screen for. | "There is no page at {address}. The link may be old or mistyped." with the link **Go to your tenants**. |
| **For operators** | An address under **Instance** when you are not an operator. | "This screen is part of running the instance, which only its operators can do. An operator of this instance can give you access." with the link **Go to your tenants**. |
| **This page could not be shown.** | A screen failed. | A crash notice with **Try again**, **Reload** and **Go back**. |
| **Your session ended** | The session is over. | See [the sign-in screen](../../../console/reference/screens/account/sign-in). |
| **Skip to content** | The first :kbd[Tab] of a page. | A link to the screen's own content. |

A new page takes the focus to its heading.

## Permissions

The frame needs none, except as listed for what it shows: a screen appears under a section to everyone, and the screen itself says what it needs. See [what you may do](../../explanation/basics/what-you-may-do).
