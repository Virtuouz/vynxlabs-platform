# Run log: develop/explanation/widgets/how-widgets-are-kept-safe.md

An explanation has no steps to run. What it says of the frame was exercised by `e2e/widget-frame.spec.ts` (lane b4: a hostile widget tries the API, another origin, XHR, cookies, storage, the parent's document, navigation, a window, an undeclared event, malformed payloads, a huge box; each fails), which was not rerun here. The Clinic load widget of Fernhill drew in the page's own frame on this lane's instance (http://localhost:8462) at 1440, 768 and 390 px in light and dark, and a press by keyboard narrowed the page.
