// The pictures of the area "docs". Each entry is described at SHOTS in ../screenshots.mjs;
// its `setup` names a scene of e2e/scenes/docs.ts (or "handbook", "visit-notes", "fernhill").
import { THEMES, TIMES, VIEW } from "./common.mjs";

export default [
  {
    name: "docs/page-details-type",
    address: "docs/edit/guide/front-desk/booking",
    as: "admin",
    setup: "docs-type",
    themes: THEMES,
    // Tall: the panel shows Type, the subjects as chips and the buttons for the site's other subjects.
    viewport: { width: 1440, height: 1100 },
    ready: [{ role: "heading", level: 1, name: "Booking a visit" }],
    steps: [
      { click: { role: "tab", name: "Page details" } },
      { text: "On other pages of this site:" },
    ],
    mask: TIMES,
  },
  {
    name: "docs/draft-conflict",
    address: "docs/edit/guide/front-desk/booking",
    as: "admin",
    setup: "docs-clash",
    themes: THEMES,
    viewport: VIEW,
    ready: [{ role: "heading", level: 1, name: "Booking a visit" }],
    steps: [
      // A line of her own at the end of the source, then the save.
      { focus: ".monaco-editor .native-edit-context" },
      { press: "Control+End" },
      { press: "Enter" },
      { press: "Shift+M" },
      { press: "i" },
      { press: "n" },
      { press: "e" },
      { within: { role: "region", name: "The page as it will be served" }, text: "Mine" },
      { press: "Control+s" },
      { text: "Someone else saved this page after you opened it" },
    ],
    mask: TIMES,
  },
];
