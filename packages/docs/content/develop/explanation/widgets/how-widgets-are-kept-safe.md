---
title: How widgets are kept safe
description: "What a widget a tenant wrote could do if it ran in the page, how each of those is closed, what a widget therefore cannot do, and the worst that is left."
subjects: [widgets, widget-frame, apps]
---

A widget's view is code a tenant's developer wrote, and it runs in the browser of everyone who opens a page that places it. Volvel's own widgets are part of the product. A tenant's are not. This page says why that matters, what Volvel does about it, and what a developer gives up for it.

## What a widget could do if it ran in the page

Suppose a tenant's view ran in the page's own document, as the product's own widgets do. Its script would have the page's rights. It could:

- **Act as the viewer.** The page holds a session cookie for the console or the app. A script in the page can send requests with it: read the viewer's rows, change them, run actions, as that person.
- **Read the rest of the page.** It could read other widgets' data, the filters, the text of the page and what the viewer types.
- **Send data anywhere.** It could post what it read to a server of its own.
- **Fake a sign-in.** It could draw a form that looks like Volvel's and ask for a password.
- **Keep running.** It could navigate the page, open windows, and run for as long as the page is open.

The viewer never chose to trust the developer's code with any of that. They opened a dashboard.

## How each is closed

A tenant's widget does not run in the page's document. It runs in a frame the page makes, and the frame is closed in these ways.

| The danger | What closes it |
| --- | --- |
| Act as the viewer | The frame is `sandbox="allow-scripts"` with no `allow-same-origin`, so its origin is opaque: it has no cookie, no storage and no access to the page's. The file it is served from is also answered with `sandbox allow-scripts` in its own policy, so it has no origin even when opened by itself. The file is served without reading or setting a cookie, the same for every viewer. |
| Read the rest of the page | The sandbox has no `allow-same-origin`, so the page's document is out of reach. The only way in is `postMessage`, and the page believes a message only when it comes from that frame's own window. The frame is given its own widget's inputs and nothing else. |
| Send data anywhere | The file's content security policy is `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data: blob:`. There is no `connect-src`, so `default-src 'none'` leaves the script no `fetch`, no socket and no beacon. It can load its own script, inline styles and `data:` or `blob:` images, and nothing from another site. A script can still try to send what it holds by moving the frame itself to another address (`location.href`, a refresh tag), which no policy of the frame's own stops. So every page of the console carries `frame-src` for the instance's own addresses only, and a frame cannot be made to load anything else. The build also refuses a view that imports from an `http` address or calls `import()`. |
| Fake a sign-in | The frame has `allow=""` and no `allow-forms`, `allow-popups`, `allow-top-navigation` or `allow-modals`: it cannot post a form, open a window, navigate the page or show a dialog. It is drawn in its cell, with the widget's title on the card the page draws, so it cannot cover the page. |
| Keep running | A frame that sends more than 20 messages a second for 2 seconds is removed, and the cell says so. A message over 64 KB is dropped. A request for the next page of rows or an order is answered at most four times a second, and only for a rows input the definition declares. The frame is as tall as its cell, at most 4000 px. A frame that does not say `ready` in 10 seconds is shown as not loaded. |

Two more checks sit between the frame and the page:

- **Data comes only from the server, under the viewer's rules.** A view does not fetch. The page's file says what each input reads, the server reads it for the person looking and applies the table's rules, and the result is posted in. A viewer who may read fewer rows sees fewer. A view cannot ask a question the page did not.
- **Only declared events get through, checked against their schema.** The view may raise an event its definition declares. The page checks the name against the events the definition declares (an inherited name such as `constructor` is not one) and checks the payload against the event's JSON Schema, and drops what does not fit. The check is run on the page's own thread, so a schema's `pattern` that could take without end (a repeated group, a back reference, a look-around, more than two open-ended repeats, or over 200 characters) is not run and the event is dropped, and a string over 256 characters is refused before any pattern runs. What the event does is what the builder attached to it: a step the page's file names. A message the page does not understand does nothing.

A deployed version never changes. A page places a version, and the version's files are the same for everyone. What a file is served as is said by its name (`.html`, `.js`, or plain text), not by what the bundle claims, and every answer under the widgets' address, a refusal and a redirect too, carries the same policy. What a reviewer saw is what a viewer gets until someone updates the page. See [Write a widget for your tenant](../../how-to/writing-a-widget).

## What a widget therefore cannot do

- **It cannot call the API.** It has no session and no network. A view that needs data declares an input, and the page reads it.
- **It cannot use an outside service.** No font service, no analytics, no map tiles, no image from another site. Bundle what it needs, or send it as data.
- **It cannot act without the page.** It can tell the page something happened. The page decides whether anything follows.
- **It cannot draw outside its cell.** It cannot open a window, a dialog or a form of its own.
- **It cannot keep a secret from the developer's own repository.** A view is a script every viewer downloads. Do not put one in it.

These follow from the design above. They are the price of a widget that the developer's own tenant can run without a review of every line.

## The worst case

A widget that is written badly or on purpose can draw wrong things inside its own box: a wrong number, a misleading label, a gauge that is always green, a button that raises an event the builder attached an action to. That last one is the builder's choice: they attached it. A widget can ask for a height and be refused. It can stop answering, and the cell says it did not load. It can spend the viewer's processor for as long as the page is open, as any script can; a frame that floods messages is removed, a loop that does not is not.

It cannot read what the viewer may read, send it out, or do something the page did not say.

## What this is not

This is not a review of the code. Volvel does not read a view. It holds the view in a frame where what it can do is small and what it did not declare is dropped. Who may deploy a widget is a matter of access: `deployment:write` in the workspace. Anyone who has it can change what every viewer of the page sees inside the widget's box.

## Related

- [Write a widget for your tenant](../../how-to/writing-a-widget)
- [The widget frame](../../reference/tenant-widgets/the-widget-frame)
- [What an app may load](../../reference/apps/content-policy): the policy of an app of files, which is not this one
- [How access to an app works](../apps/app-access)
