---
title: Saving and leaving
description: "How the console keeps what you change: editors that save a draft by themselves, settings screens with a save bar, the question before you leave, notices, and what happens when your session ends."
subjects: [saving]
---

The console keeps your work in three different ways, and a screen uses the one that fits what it holds. Knowing which is which tells you when a change is safe to leave.

## Changes that are saved as you work

The editors for scripts, flows, apps and dashboards keep a :term[draft]{id=draft} for you. The script editor saves 3 seconds after your last change. The flow editor says what it is doing: "Saving…", then "Draft saved {time}"; if a save fails it says "Could not save. Trying again…", and after several tries "Could not save." The App Builder and a dashboard's editor say "Saving…" and, if it fails, "Not saved: {why}".

A draft is saved in the console and is not live. It takes effect when it is deployed, as part of a version. The overview counts drafts that have not been deployed, and the header offers **Review** for them. See [Dev and production workspaces](dev-and-production).

Where two people edit the same flow, the editor says "Not saved: someone else saved this flow" rather than overwriting theirs.

## Changes that wait for you to say so

A settings screen, such as Branding, Single sign-on, Provisioning, Retention, Workspace settings or the console branding of the instance, keeps your edits in the form until you press **Save**. Once something is different the bar **Unsaved changes** rests on the bottom edge of the screen with **Discard** and **Save**; :kbd[⌘S] saves too. After either button the focus returns to where it was. While the instance takes no changes, **Save** is off, and the bar says "It cannot be saved now: the instance takes no changes."

A dialog or a side sheet for making something new keeps nothing: **Cancel** forgets what you typed. A longer form opens as a side sheet.

## Changes that are made at once

A row of a table is data. When you press **Save row**, change a cell or confirm a delete, it is made at once and is not a draft; no deploy is needed. The same is true of an API key you make, a person you suspend, a trigger you pause, and the like: the screen asks first when the change cannot be taken back.

## Leaving

When a screen has changes that are not saved, going to another screen asks "Leave without saving?", with the sentence "Your changes to {what} are not saved." and the buttons **Leave** and **Stay**. Closing or reloading the tab uses your browser's own question instead. **Sign out** asks the same question first. If signing out fails, the console says "You could not be signed out. Check your connection and try again." and you stay signed in.

Signing out clears what this browser keeps of you: your settings, your pins and what it had read. The instance keeps your settings, and they come back when you sign in.

## When your session ends

A session lasts 7 days, and it can be ended from **Account**. When a request is refused because the session is over, a dialog, **Your session ended**, opens over the page. It cannot be dismissed. Sign in again as the same person, with your password or, in a new tab, with your organization's sign-in, and the page carries on with what you typed kept. If another person signs in, the page reloads clean for them.

## Notices and undo

A short notice in a corner confirms what just happened. It leaves by itself after 5 seconds, or 10 when it has a link or a button. A failure stays until you close it. Pointing at a notice holds it, and :kbd[Esc] closes it while it has focus. Up to 3 show at once. A failure notice has **What does this mean?**, which opens the explanation of that error. The flow editor, the App Builder and a dashboard's editor undo and redo on :kbd[⌘Z] and :kbd[⇧⌘Z], outside a field you are typing in. Removing a step from a flow does not ask first; undo it with :kbd[⌘Z].

## What is kept for you, and what is not

Some things belong to you and follow you from browser to browser: the theme (also when you choose it on the documentation at `/docs`, while you are signed in), whether the navigation is open, the single-key shortcuts, row density, panel sizes, palette pins, whether your team's terms are underlined and saved views. They have no screen, are kept without asking and leave no entry in the audit log. An API key or a service account has none of them.

Where you were last in a tenant, and what the palette shows as **Recent**, are kept only where you are a member of the tenant, not under an operator's access grant.

## How it fits

- [Filter, sort and save a list](../../how-to/basics/work-with-lists) explains saved views.
- [Limits and timings](../../reference/basics/limits) lists the numbers named here.
