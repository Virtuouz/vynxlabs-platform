---
title: How tables work
description: What a table is in Volvel, who manages it, why a deploy never drops its data, how rules and row rules fit, and what happens to files.
subjects: [tables]
---

A table is where a workspace keeps rows of its own. This page explains what a table is, who manages it, what removing one means, and what the console does and does not remember about rows. To make one, follow [Your first table](../../start/tutorials/your-first-table).

## The idea

A table is a :term[resource]{id=resource} that belongs to a :term[workspace]{id=workspace}. It has a name, columns and a rule about who sees its rows. Its rows are kept in a Postgres database, in a table of their own. The **Definition** tab of a table says where, and says that you can read the rows there directly at any time.

Every table has three columns you do not define: `id`, `created_at` and `updated_at`. A definition cannot declare them.

Two things are kept apart. The table's **definition** is its columns and rules. Its **rows** are the data. A change to the definition is never allowed to lose rows, and that is the rest of this page.

## Where a table is managed

Each table has one owner. The list of tables says which, under **Managed in**:

- **Files.** The table is a file: you made it with **Create table**, or the repository holds it as `<path>.table.yaml`. The console and the repository both edit it. You change its columns and rules on its **Definition** tab, and adding a column or a rule applies at once. A deploy of the repository that would replace what the console changed since is refused until `volvel pull`, or `--force`.
- **Code.** It is written with `defineTable` in the tenant's repository, and it changes when a bundle is deployed. In the console its **Definition** tab shows a notice and no controls: "This table is defined in code, in the tenant's repository. To change it, change `defineTable` there and deploy, or take it over here: it is then managed as files, and you remove its definition from the code after a volvel pull."

A table is of one owner or the other, never both. Rows of both kinds are added, changed and deleted on the **Rows** tab.

A definition in code is worth having when a table shares values with other definitions, such as a list of kinds that is also in an event's payload. For a table that stands alone, the file is plainer, and a script is typed by it either way. See [Definitions in code](../../develop/explanation/cli/definitions-in-code).

### Take over a table of Code

In a dev workspace, **Take over in the console** on the **Definition** tab makes a table of Code a table of Files. Its rows stay. The console manages it from then on. The definition stays in the code until you remove it there. `volvel pull` writes the table's file, `<path>.table.yaml`, and says that the table is still defined in code; while it is, a deploy of the repository is refused as defined twice. A deploy of the code alone, without a pull, is refused too if the console changed the table, until you pull or deploy with `--force`, which takes the table back to the code's definition. To keep the table in the console, pull, then delete its definition from the code and deploy. See [Definitions in code](../../develop/explanation/cli/definitions-in-code). A production workspace has no take-over: a table of Code there changes by a deploy only.

## Why a deploy never drops data

The work of making a workspace's tables match a definition is planned before it is done, and the plan has no step that drops a table or a column. What a definition no longer has is **retired**: the table or column is marked, hidden from use, and its data stays where it is.

- A **retired table** cannot be read or written. Its rows are kept. If other tables hold references to it, the keys that tie them are dropped while it is away and put back when it returns.
- A **retired column** keeps its values. It stops being required or unique, and its default is dropped from the database. Bringing a column back in the console restores its type and what its rows may hold, and not those settings: see [Retire a table or a column, and bring it back](../how-to/data/retired-data).
- A deploy retires a table when the bundle no longer lists a table that the repository owned, as a file or as code. A person with `resource:write` can also retire a table of the console by hand, with **Retire table** on its **Definition** tab.
- A table that other tables refer to is not retired. The refusal names each table and column that refers to it, because no later deploy could succeed until they were changed.

Retiring is undone in two ways:

- **Bring back.** A retired table that was managed as files shows **Bring back**, for a person with `resource:write`. It saves the definition the catalog kept: the active columns with their rules, defaults, references and values, who sees rows, what stands for a row and the indexes. Its rows are there again. Retired columns stay retired.
- **Deploying a definition with that name.** For a table managed as code, the retired table's page says "Deploying a definition with this name brings it back."

The one way to destroy data is **Delete for good**, on a retired table or a retired column. You type its name to confirm, it needs the permission `table:write`, and it is written to the audit log as `table.purged`. Nothing a deploy does reaches it.

## Rules and row rules

Volvel uses "rule" for two different things, at two levels.

**Column rules** are about a value. On a column, **Rules** sets whether every row must have one (**Required**), whether every row's value must be different (**No two rows alike**), and the value given when none is. A change that existing rows would break is refused. For example, a column cannot be made required while rows lack a value, unless you give a value to put in them.

**Row rules** are about who sees which row. They belong to the table, under **Who sees rows**, and have three forms:

- **Everyone with access sees every row.** The default.
- **Each person sees their own rows.** One column holds who added the row. Choosing "Each person sees only the rows they added" when you create a table adds that column, `owner_id`.
- **Rules decide.** Up to 20 rules, each allowing a person to read, or to read and change, the rows where a column matches: the person's own ID, a group they are in, or one of their attributes.

Row rules limit people, and the people who hold `data_all` are past them: the permission reads every row whatever the rule says. The built-in `developer` and `viewer` roles hold it for reading, so a row rule does not hide rows from them. Row rules are saved with **Save who sees rows**, not as you type. What you have set and not saved is not applied and **Undo** does not take it back; once saved, the change is one step of undo like any other change to the definition.

## What happens to files

A column of type **File** holds a reference to a file that Volvel stores. A file is at most 25 MB.

- A file a row names cannot be deleted. The **Files** screen says "A file that a row names cannot be deleted: change the row first."
- A file that a row no longer names, because the row replaced or removed it, is not deleted at once. A note is kept of which row and column it came from, and the file stays for as long as the audit log does, 400 days unless the tenant's retention says otherwise. Then the note and the file go.
- The same holds for the files of a deleted row, and for the files of a table deleted for good.
- A file that a row names is kept by that clean-up, whatever its notes say.

The console has no screen that lists a row's earlier files or puts one back.

## Row edits are not audited

Adding, changing and deleting rows is not written to the audit log. Rows are business data, not configuration, and the audit log records changes to configuration. What does record a row change is an event: each insert, update or delete announces a `platform/row-changed` event.

This differs from a change to a table's definition, a retirement or a **Delete for good**, which are in the audit log.

## How it fits

A table is one kind of resource, and a workspace holds resources of other kinds beside it. See [concepts](../../start/explanation/concepts) for how workspaces, resources and deploys fit.
