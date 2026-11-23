---
title: How a query is answered
description: Why a query only reads, why two people can get different numbers from one query, what a saved query adds to SQL, and how a data source differs from a table.
subjects: [queries, sql, permissions]
---

A query is a question about a workspace's data. This page explains how Volvel answers one: who it is answered for, what it is allowed to touch, and why the same query can give two people different numbers. To write one, see [Write, run and keep a query](../../how-to/queries/write-and-run-a-query).

## The idea

A query is answered **as the person who asks**. Volvel does not run it as the workspace and then hide rows. It runs it as the asker, over the tables, with each table's rules for who sees which rows in force. A person who may see only their own invoices gets a total of only their own invoices from the same query that gives a practice manager the whole practice's total. This is why a dashboard built on a query shows each person the rows they may read, and why a query gives every row only to a person who holds `data_all:read`.

The same holds for every way a question is asked: SQL typed on the **Queries** screen, a saved query run by name, a widget built from menus, and a dashboard's table. All are checked and run the same way.

## What a query is allowed to do

A query is one `SELECT`. It reads. Volvel does not trust SQL because a person with `sql:read` wrote it: the text is read by Postgres's own parser, checked against a list of what is allowed, written again from the parse tree, and run in a transaction that can only read, with a time limit and a cap on the size of the answer. A function is on the list when it only works on the values it is given, so one that reads a setting, a file or another session, or that waits, is refused. A table is reached only through the workspace's own tables, named by path. The contract is in [SQL in a query](../../../develop/reference/queries/sql-reference).

Two separate permissions meet in a run. `sql:read` is the right to write and run SQL of your own. `data:read` on each table is the right to read its rows. Holding the first does not give the second, and a wildcard never gives `sql:read`: a role has it only when it names it.

## Saved queries and who may run them

A query that is kept by name is a resource of the workspace. Its text is the workspace's, so **writing SQL is not asked of whoever runs it**: a deployed query can be run by name by anyone who may read each table it reads. That is how an analyst without `sql:read` uses a query a developer wrote, and how a widget in an app reads one.

What a saved query adds to SQL is a name, a description, and **parameters** that say what each value is and check it. A value that does not fit, a needed value that is missing, or a name the query does not have is refused in the same words by the screen, the API and a widget. See [Query parameters](../../reference/queries/query-parameters).

A query is written in a dev workspace and promoted. A production workspace runs it by name and does not keep or edit it.

## Queries from menus

A widget can ask without SQL: a table, a filter, a grouping and a value, chosen from menus, which is stored as data and written into SQL by Volvel. It goes through the same checks and the same permissions as typed SQL, and asks no `sql:read`. Its days are counted in the reader's time zone, where SQL counts them in UTC. See [Visual queries](../../reference/queries/visual-queries).

## A data source is not a table

A **data source** is a Postgres database outside Volvel that a workspace is connected to. Its tables look like tables in a grid and can be read and written, but they differ from a workspace's tables in ways that follow from where the rows live:

- The rows belong to that database. Volvel does not copy them, does not change the database's structure, and does not record changes to its rows in the audit log.
- The rules for who sees which rows are not Volvel's to apply. The database's own user decides what may be read and written, and a person with `data_source:read` sees the rows that user can.
- A source's table can be **listed** on a page, as it is, and cannot be **totalled**, grouped or joined with a query. A query cannot name a source's table at all.
- The address and the password belong to a workspace and are never in the repository.

Choose a data source for data that must stay where it is. Choose a table for data a workspace owns and wants to share by rules.

## How it fits

- The permissions, in one place: [SQL and data source permissions](../../../administer/reference/queries/sql-and-source-permissions).
- Where a query's answer is drawn: [How dashboards the workspace keeps are changed](dashboard-resources).
- How tables decide who sees rows: [How tables work](../how-tables-work).
