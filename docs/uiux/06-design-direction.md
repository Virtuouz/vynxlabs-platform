# 6. Design direction

This document says what the console should become and why. It rests on the audit in documents 01 to 05 and sets the direction that the specification (07), the component standards (08) and the roadmap (09) carry out. Nothing here is implemented.

Evidence labels are the same as in the other documents: **Verified** (read in code at `e737382`), **Observed (mocked API)** (seen in the built console with fixture data), **Inferred**, and **Judgment** (a design opinion). Most of this document is judgment. Where a rule comes from a usability or accessibility finding, it says so.

## Main points

- The direction is **"Quiet infrastructure, vivid state."** The console already follows the first half. The second half is where it falls short: state, failure and the next action are often among the quieter things on a screen.
- The phase 8 visual language is kept. Colours, fonts, the shell and the motifs stay. The change is in sizes, density, hierarchy, and the number of ways each pattern is built.
- Three structural ideas carry most of the improvement: **one list**, **one object page**, and **one continuous loop** from a failure to its fix.
- Density goes up on operational screens (runs, events, audit, logs, tables) and stays where it is on forms and sign-in.
- Keyboard use is designed in as a second layer over visible controls. It is not a separate mode.
- Fourteen reference products were considered for patterns. Seven patterns are adopted, each tied to a problem found here. Several popular ones are declined.

## 6.1 Where the console stands

The audit scored 83 surfaces. The mean is about 66 out of 100, with a range from 54 to 80. No surface is reference quality, and none is broken. In the rubric's bands the console is "functional / inconsistent" moving into "good but visibly improvable".

| Area | Typical score | Reading |
| --- | --- | --- |
| Shell, navigation, palette | 57–66 | A sound frame with gaps in orientation, URL state and keyboard reach |
| Workspace overview | 72 | The clearest screen in the product |
| Runs and run pages | 62–68 | The right content, in the wrong order of emphasis and too loose |
| Flow editor | 66 | A real workspace with drag-only connections and a few rough edges |
| Script editor | 58 | The weakest major surface: a form around an editor |
| Data and app building | 54–66 | Capable, but a table of buttons instead of a grid, and no undo in the builder |
| Configure | 55–70 | Connections are good, and the rest are generic lists |
| Tenant and instance admin | 56–80 | Careful copy and safety, with five list idioms |

The scores say something specific. **Visual craft is not the weak category.** The weak ones are keyboard and expert efficiency, interaction efficiency, and design-system consistency. A redesign that changed colours and type would move the scores very little.

### What is already right and must not change

| Decision | Why it stays |
| --- | --- |
| Colour used only for state and the primary action | It is the core of "vivid state". 22 semantic tokens, no raw colours in screens (Verified, 02) |
| State as icon plus word, never colour alone | Meets WCAG 1.4.1 and reads in both themes (Verified, `kit/status.tsx:65-82`) |
| Monospace for paths, IDs, durations and versions only | Makes machine values scannable without turning the interface into a terminal |
| The scope path in the header: tenant, workspace, environment, promotion target | Answers "where am I" in one line (Observed) |
| Overviews that lead with "Needs attention" | The right first question for an operator |
| Production always marked, and read-only for code | A safety property, not a style |
| Copy that explains consequences in plain words | Destructive confirmations and empty states are unusually specific (03, part C) |
| Light and dark as equals, per-instance branding through tokens | Dark is a working condition here, not decoration |
| Base UI underneath the kit | Dialog, menu, tabs and combobox behaviour is already correct |
| `SchemaForm` with a Fields/JSON switch | The right answer to "forms from schemas" |
| Undo in the flow editor, with labelled steps | A model for the other builders |

## 6.2 The north star, made operational

"Quiet infrastructure, vivid state" is only useful if it can settle an argument about a screen. These are the rules it produces.

### Rule 1. Every screen answers four questions in order

Where am I? What object is this? What state is it in? What can I do next?

The header answers the first. The page's first line answers the second and third together. The primary action sits beside them. Anything else is secondary.

Applied to the script run page, the order today is: breadcrumb, path at 20 px, then a 13 px line that holds the state among duration, attempt, trigger and version (Observed, O6). The target order is:

```
Failed · reminders/send                                   [Re-run ▾] [Edit in dev]
The SMS gateway said no: 503 Service Unavailable   →  line 42 of the log
3.0 s · attempt 2 of 2 · schedule reminders/hourly · v4 · run r1 ⧉
```

State and object share the first line at the same size. The reason is the second line. The actions that respond to it are at the end of the first line. Diagnostic metadata is the third line, in the `meta` role.

**Why:** an operator opening a run wants the verdict before the identity. This is the "hierarchy before decoration" idea in Kennedy's public writing, and it matches NN/g's guidance on reducing the work of reconstructing a story from equally weighted facts.

### Rule 2. Contrast is a budget, and state spends it

On any screen, the strongest contrast belongs to, in order: a failure or a state that needs a person; the object's name; the primary action; data values. Labels, chrome, navigation and help text take what is left.

This has consequences:

- Page titles shrink. A 26 px title on "Runs" spends contrast on a word the navigation already shows. Titles become 20 px on working screens (07).
- Descriptions under titles move behind a help affordance on workbenches. The Runs description is useful once.
- Section labels stay small and uppercase. They are wayfinding.
- A failure is never a generic red banner at the top. It is placed at the thing that failed and names it. "The flow failed." becomes "`place_order` failed: The supplier refused." with the step selected.

### Rule 3. Spacing shows grouping before any box does

The order of tools is: whitespace, then type, then a tinted surface, then a border. A border is used where the boundary means something to the user: an editor pane, a selectable node, a table, a dialog, a resizable region.

The audit found about 35 nested bordered boxes, mostly a `Notice` inside a `Panel` (Verified, 02). Workspace settings wraps four single sentences in four cards, one of them under a label that repeats its heading (Observed, O13). These become a plain settings list: label, sentence, control, separated by spacing and one hairline.

**Why:** each box adds four edges for the eye to resolve. In a dense tool the edges add up faster than the content.

### Rule 4. Density is the default on operational data

Rows of runs, events, audit entries, log lines and table data are single-line, 28 to 36 px. Two-line rows are an option a user turns on, not the default.

The runs list today shows about 10 rows in 900 px (Observed, O3). At 32 px rows with a one-row toolbar it shows about 24. That is the difference between seeing a failure pattern and scrolling for it.

Density does not apply to forms, sign-in, confirmations or empty states. Those keep 32 to 36 px controls and room to read.

**Why:** NN/g's guidance for complex applications is to remove what is irrelevant, not to remove information. IBM Carbon's table densities and Datadog's high-density mode are the same position.

### Rule 5. One pattern per job

A user should learn each of these once: how a list behaves, how an object opens, how a page is titled, how a thing is saved, how success is confirmed, how a destructive action is confirmed.

Today there are six list implementations, seven page-header variants, six back patterns, four tab implementations and three save models (Verified, 02). The user-visible cost is that "open a row" does four different things across Workspaces, Members, Domains and Single sign-on (03, part C).

### Rule 6. State is never ambiguous

Every asynchronous thing says what it is doing now, what has happened, and what the user can do. Concretely:

- A running run shows elapsed time that counts.
- A live screen says whether it is live, reconnecting, or stale since a time.
- A save shows saving, saved at a time, or failed with a retry.
- A button that started work shows that it did.
- A success names its result and links to it.

Today only 12 of 40 files that perform writes ever show a success toast, and the only connection indicator is one label on the runs list (Verified, 01).

### Rule 7. The interface never says something untrue

The shortcut sheet lists `j k` to move through a list. No handler exists (Verified, `kit/CommandPalette.tsx:744`). A failed data-source test is announced as a success (Verified, `screens/Data.tsx:1068-1072`). Dashboards says "saved as you make it" and needs a manual save (Verified, `screens/Dashboards.tsx:62`). A new script opens with an error marked on its own first line (Observed, O8).

Each is small. Together they teach a careful user not to trust the chrome. These are P0 in the roadmap for that reason.

## 6.3 Three structural ideas

### One list

Every collection uses one component with one behaviour: single-line rows, a priority order for columns, sort, filters and selection in the URL, arrow and `j`/`k` movement, `Enter` to open, `Esc` to close, a checkbox column where batch actions exist, and the same loading, empty and error states.

This is the largest single change. It removes the most inconsistency, gives keyboard users one model, and is the base for saved views and batch actions later. The specification is `DataTable` in 08.

### One object page

Every important entity has three tiers of detail:

| Tier | What it is | Used for |
| --- | --- | --- |
| Row | One line in a list | Scanning |
| Inspector | A docked panel beside the list, with its own URL parameter | A quick look without losing the list |
| Page | A full page with a stable URL | Work: reading logs, editing, debugging |

A page has one header pattern: breadcrumb, state plus name, primary actions, a meta line, then tabs. Scripts, flows, runs and triggers have pages today. Connections, variables, secrets, events and approvals do not, so they cannot be linked to (01).

### One continuous loop

The product's most valuable journey is:

failed run → failed step → source at that version → edit in dev → test with the failed input → deploy → promote → new run

Today it takes 27 interactions, 11 page loads, two workspace switches and two re-finds of an object the user already had open. Deploy and promote end in notices that lead nowhere, and "Retry from the failed step" always runs the original version, so it cannot pick up the fix (04 §4). The target is 10 interactions and no re-find. The target is that each stage offers the next as a link that carries the object and the input with it. No stage requires finding the same script or flow again.

This is "context continuity". It needs no new capability on the server. It needs links, URL state, and success messages that point forward.

## 6.4 Visual character

**Judgment.** The product should read as an instrument: closer to Linear, Vercel, VS Code and Datadog than to a marketing-era SaaS dashboard.

| Property | Direction |
| --- | --- |
| Surfaces | Neutral and flat. Canvas, surface and one sunken tone. No gradients, no glass |
| Type | System sans for interface and prose. System mono for machine values. Hierarchy from size and weight in a short scale |
| Colour | Teal for action and focus. Red, amber and green for state. Everything else neutral |
| Geometry | 4 to 8 px radii on working surfaces. 12 px only on dialogs |
| Depth | Borders, not shadows, for anything in the page flow. Shadow only for things that float |
| Motion | Short and causal: a sheet comes from its edge, a menu from its trigger. Nothing loops except a running indicator |
| Iconography | One library, three sizes, one stroke |
| The motifs | The signal path, the port corner and the junction dots stay. They are the product's own marks and they carry meaning (scope and release flow) |

### Fonts

The fonts stay as system stacks. No audit finding is solved by changing them. A custom face would add a download, a licence check and a rendering difference across platforms. The problems found are the number of sizes in use and their roles, which 07 fixes.

### Dark mode

Dark is treated as a first-class working theme with its own contrast checks. It is not a finishing step. Every token change in 07 is specified for both themes with ratios, and the contrast test in 10 runs on both.

### Production

Production is the one thing nobody should have to look for. Today it is a 10.5 px amber tag, and the same amber tone marks "Paused" and "Instance · operator" (Verified, 01). The direction is that amber as an environment signal belongs to production only, and that a production workspace is marked in three places that agree: the header tag, the workspace switcher, and a thin amber rule under the header.

## 6.5 Density by surface

| Class | Row or control height | Surfaces | User-configurable? |
| --- | --- | --- | --- |
| Highly dense | 20–24 px lines | Log viewer, JSON viewer, code | Wrap and font size only |
| Compact | 28 px rows | Audit log, events, table rows, run steps | Yes: compact or standard |
| Standard | 32–36 px rows and controls | Runs, triggers, flows, scripts, members, most lists, toolbars | Yes: compact or standard |
| Comfortable | 36–40 px controls | Forms, wizards, dialogs, settings | No |
| Low | Free | Sign-in, empty states, first-run, the approval link page | No |

A density preference is worth offering for tables only. It is one setting per user with two values. It is not worth offering for the whole interface: a global density switch doubles the layout testing and solves no finding.

## 6.6 Navigation and command direction

### Navigation

The rail, section panel and header are kept. Four changes:

1. **A visible breadcrumb.** The header shows Workspace › Section › Object. The section name is screen-reader-only today (Verified, `Shell.tsx:788`).
2. **The section panel steps aside on object pages.** A run page or a connection page gets the panel's 224 px back, with one click to reopen it.
3. **The URL holds the view.** Tabs, stepper steps, filters, search, sort, selection and the open inspector are in the address. Opening an object pushes a history entry, so Back closes it.
4. **The same object in the other workspace.** From a script, flow or trigger in production, one control opens the same path in the linked dev workspace, and the reverse.

### Command palette

A palette is justified here, and one exists. The question is what it should do that it does not.

It already searches nine resource kinds, runs by ID or tag and people, keeps recents on the server, and runs eight to ten actions (01). What it lacks, in order of value:

| Gap | Direction | Why it matters here |
| --- | --- | --- |
| No commands for the open object | "Re-run", "Cancel", "Edit in dev", "Copy run ID", "Pause trigger" appear first when that object is open | The palette becomes the keyboard path to every primary action |
| Screens listed first on an empty query | Recent and pinned objects first, then context commands, then screens | The section panel already lists screens (Observed, O14) |
| Results that open only a list | Every result opens its object | Connections, events, apps and people open their list today |
| No loading or error state | A spinner row while searching, and "Search failed. Retry" | A failed search reads as "Nothing matches" today |
| No release actions | Deploy, promote, approve | These are the highest-value actions in the product |
| Shortcuts not shown | Each command shows its shortcut at the right edge | The palette teaches the shortcuts |

What it should not become: a second navigation tree, or a place for settings that have a screen.

### Keyboard

There are two layers. Every action is reachable from a visible control. Every frequent action also has a key, and the key is shown wherever the action is shown: on the button's tooltip, in the menu item, in the palette row, and in a shortcut sheet reachable from the account menu and from `?`.

One registry holds all shortcuts so that the sheet cannot drift from the handlers again.

## 6.7 Editors and builders

Editors are workspaces. The work takes most of the viewport and configuration supports it.

| Editor | Today | Direction |
| --- | --- | --- |
| Script editor | Code is about 39% of the viewport. Settings open first. Output is below the fold (Observed, O8) | Code and a test pane side by side with a draggable divider. Try it first, settings in a collapsible panel. Problems listed and clickable. ⌘S saves, ⌘↵ runs, from inside the editor |
| Flow editor | Canvas about 71% wide. Steps connect by drag only. New steps land unconnected | Keep the layout. Add steps after the selection, already connected. Connect and re-route from the inspector. Problems clickable. Test from a chosen step |
| App Builder | About 200 px of chrome above the canvas, palette below it, no undo | Canvas first. Palette and an outline at the left, inspector at the right, both resizable. Undo with the flow editor's history module |
| Resource editor | A narrow single column | Becomes an object page with a form and a live preview column |

All of them share: no loss of work on navigation, autosave with a visible state, undo, and panel sizes remembered per user.

## 6.8 Responsive and adaptive direction

This is a desktop tool. The design target is 1280 to 1920 px, then wider.

| Width | Behaviour |
| --- | --- |
| Under 768 | Triage only: overview, runs, a run, approvals, triggers pause and resume. The rail is a drawer. Editors show a notice that they need a wider screen, with read-only viewing |
| 768–1023 | Rail visible. Section panel is a drawer. Inspectors are sheets |
| 1024–1279 | Section panel docked. Inspectors are sheets |
| 1280–1919 | Inspector docked. Editors show two panes |
| 1920 and wider | List and detail side by side. Run page shows steps, logs and input/output at once. No single column stretched across the screen |

Two findings drive the last row. At 2200 px the runs list's "What" column is about 1240 px wide and mostly empty (Observed, O3), and form pages are capped while workbenches are not (Verified, 02). Wide screens should gain a pane, not whitespace.

Phone widths today cost more than they return for editors. The flow editor's inspector is likely clipped when stacked (Inferred, 05). Marking editors as desktop-only below 1024 px is more honest than a layout that technically fits.

## 6.9 Onboarding and empty states

The product teaches by making the user productive. No tour.

- A fresh instance leads its operator to a first running script in a few steps, with a checklist that reflects real state: tenant, workspace, worker, first script, first run. Today it takes about 31 interactions, and the operator is stopped at an access gate on a tenant they just created (Verified, 03 part C).
- New script and new flow offer two or three starter templates that run as they are.
- Every empty state names the object, says in one sentence what it is for, and offers the primary action, with the CLI path as a second option.
- Help sits beside the task: a hint under a field, a tooltip on an icon, a "Learn more" link to the docs. There is no Tooltip component and no docs link in the console today (Verified, 01).

## 6.10 Patterns from reference products

The reference set is Linear, Vercel, GitHub, VS Code, Figma, Stripe Dashboard, Datadog, Windmill, n8n, Temporal, Trigger.dev, Retool, Raycast and Notion.

**Source and limits.** These descriptions come from the research report supplied with this assignment and from `docs/evolution/03-competitive-analysis.md`, which cites vendor documentation as checked on 2026-11-14. No product was re-examined for this audit, and no visual design is copied. Treat each as a pattern to adapt, and confirm current behaviour before citing it as a precedent.

### Adopted

| Pattern | Seen in | Problem it solves | Why it works | Does the problem exist here? | How it is adapted |
| --- | --- | --- | --- | --- | --- |
| Contextual command menu with shortcuts shown | Linear, Raycast | Actions are far from the selected object, and shortcuts must be memorised | The menu opens at the object and each item shows its key, so use teaches the shortcut | Yes. Row actions are sparse, and no shortcut is shown anywhere but one sheet | Row and object menus list actions with keys. The palette shows the open object's commands first (P3-1, P3-2) |
| Global command menu with recent items on empty | Vercel Geist, Linear | Deep navigation to a known object | Recognition from a short recent list is faster than recall of a path | Partly. The palette exists but opens on screens | Recents and pins first (P3-2) |
| One dense, accessible table with batch actions | GitHub Primer, IBM Carbon | Many lists with different behaviour | One keyboard and selection model learned once | Yes. Six list implementations | `DataTable` (P2-2), batch actions (P3-3) |
| Run detail that combines status, timeline, logs, input and output | Trigger.dev, Windmill | Debugging requires several screens | The evidence is in one place and updates live | Mostly solved by phase 9. Emphasis, step selection and source links are missing | P1-2, P1-6, P1-7 |
| Load a past execution's data into the editor | n8n | A production failure cannot be reproduced where the code is edited | The failing input travels to the place of the fix | Yes. The link from a production run to the dev editor does not exist | "Edit in dev" carrying the failed input (P1-3) |
| Several views of one execution history | Temporal | One representation hides either order or structure | Timeline, graph and raw events answer different questions | Partly. Timeline and Graph exist. The step is not in the URL and events are not exposed | Keep both, add `?step=` and a raw view (P1-2) |
| Resizable multi-pane workspace with a problems list | VS Code, Retool | Fixed panes waste space or hide output | The user sets the proportions and errors are a navigable list | Yes. Nothing is resizable, and diagnostics show only as squiggles | `SplitPane`, problems panel (P1-4, P3-5) |
| Search across object types, grouped | Stripe Dashboard | Finding an entity without knowing where it lives | One box, results grouped by kind | Largely present in the palette | Group results by kind and open the object (P3-2) |
| Keep the work central, reveal controls on selection | Figma | Builders crowded with controls | Controls appear for the selected thing only | Yes in the App Builder | Canvas-first layout (P2-10) |
| Preserve investigation state | Datadog | A log query or filter is lost on navigation | The state is in the address and can be shared | Yes. Most filters are component state | URL state (P2-6), saved views (P3-4) |

### Considered and declined

| Pattern | Why not here |
| --- | --- |
| A global density switch for the whole interface | Doubles layout testing. Only tables need it |
| Notion-style inline editing everywhere | Most objects here are deployed artefacts with drafts and versions. Silent inline edits would hide the draft boundary |
| A minimap on every canvas | Useful at scale only. It is shown today on a one-node flow (Observed, O9). Show it above a node threshold |
| Customisable dashboards as the overview | The overview's fixed "Needs attention" order is its strength |
| A node-based visual builder for apps | Declined already in `docs/evolution`. The widget grid with number fields is also the accessible alternative to dragging |
| VS Code's full command and keybinding customisation | The shortcut set is small. A registry and a sheet are enough |
| Animated transitions between pages | Delays expert use and adds nothing causal |
| An in-browser step debugger | Out of scope for UI work, and declined in `docs/evolution` |

## 6.11 What separates evidence from taste in this direction

| Claim | Kind |
| --- | --- |
| Text contrast, control boundaries, target sizes, drag alternatives, focus handling | WCAG 2.2 AA requirements. Not optional |
| Single-line dense rows show more rows, and scanning is faster with aligned columns | Supported by NN/g and Carbon guidance. The size of the gain here is unmeasured |
| Keyboard accelerators help experts without harming novices when visible controls remain | NN/g heuristic 7 |
| System feedback within about 0.1 s, 1 s and 10 s thresholds | Long-standing response-time research. Targets in 10 use it |
| Fewer interactions and context switches in the continuity loop | Counted from code. The effect on time is a hypothesis that 10 tests |
| 20 px titles, 4 to 8 px radii, borders over shadows, system fonts, the density table | Judgment, argued from the product's purpose |
| The scores | Judgment structured by a rubric, from code review and limited mocked observation |

The validation plan (10) exists so that the judgments are tested against tasks and not accepted because the result looks better.
