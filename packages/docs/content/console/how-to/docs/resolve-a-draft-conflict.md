---
title: Resolve a draft conflict
description: "When someone else saved a page while you were writing it, keep what you wrote or take what they saved, without losing either."
subjects: [documentation, drafts]
---

## Resolve a draft conflict

By the end the page holds the version you want, and nothing that either of you wrote is lost.

## Before you start

- You are changing a page in a dev workspace, with `resource:write` or `doc:write` alone. A doc writer has `doc:write`.
- You saw the banner "Someone else saved this page after you opened it. Nothing of theirs was overwritten, and what you changed is still here, unsaved." over the editor. A page has one draft, shared by everyone who may write the workspace. Whoever saves says which version of the draft they were looking at, and a save from an older one is refused.

## Keep what you wrote, or take what they saved

:::steps
1. Leave the editor as it is. Your text is still in the source, and **Unsaved changes** is shown beside **Save draft**.
2. Press **Copy what I wrote**. The console says "Copied what you wrote." The whole source is on your clipboard.
3. Press **Load their version**. The console asks "Load their version?" and says "What you changed since you opened the page is replaced by what they saved. Copy it first if you want to keep it." Press **Load theirs**.
4. The source now holds their version, and the banner is gone. Compare it with what you copied. Paste back the lines you still want, in the source or with **Undo** and **Redo**.
5. Press **Save draft** (or :kbd[⌘S]). The console says "Saved as a draft. Deploy it from Documentation when it is ready."
:::

::screenshot{name=docs/draft-conflict alt="The page editor with the red banner 'Someone else saved this page after you opened it', its two buttons Copy what I wrote and Load their version, and the source below still holding the unsaved text."}

## The result

The page's draft is the version you saved on top of theirs. Nothing is deployed yet: use **Deploy** on the Documentation screen when the page is ready. A reader of the served site sees the deployed page until then.

## If it does not work

- **The banner comes back when you save.** Someone saved again while you merged. Repeat the steps: **Load their version** loads the newest one.
- **You pressed Load theirs before copying.** The confirmation said what you typed is replaced by what they saved, and the page does not say how to get it back. Copy first.
- **Save draft is disabled.** Nothing has changed since the last save, or a save is already under way.
- The console does not show what they changed or who they are. To see the difference, copy your text, load theirs and compare the two yourself, or use **Compare with deployed** in the editor to see how the draft differs from what is deployed.

## Related

- [The page editor](../../reference/screens/build/documentation-editor)
- [How a docs app works](../../explanation/docs/how-a-docs-app-works)
