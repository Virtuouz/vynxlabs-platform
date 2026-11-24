/** The look of the widget preview page: the platform's own tokens (light and dark), and the page. */
export const PREVIEW_CSS = `/* The tokens are those of @volvel/ui's tokens.css, so a widget is given the values it will have. */
:root {
  --vx-canvas: #f3f5f8;
  --vx-surface: #ffffff;
  --vx-sunken: #eef1f5;
  --vx-line: #dde3ea;
  --vx-ink: #0f1720;
  --vx-ink-muted: #4b5666;
  --vx-action: #0b6b88;
  --vx-action-ink: #ffffff;
  --vx-action-soft: #dcf0f7;
  --vx-attention: #9a4707;
  --vx-attention-soft: #fdf0dc;
  --vx-danger: #b3261e;
  --vx-danger-soft: #fbe9e7;
  --vx-success: #1b6e45;
  --vx-success-soft: #e1f3e9;
  --vx-structure: #eaeef3;
  --vx-raised: #ffffff;
  --vx-selected: #e0f0f6;
  --vx-line-strong: #c6cfd9;
  /* The edge of a control, such as an input: 3:1 or more against what is around it. */
  --vx-line-control: #748090;
  --vx-ink-subtle: #586474;
  --vx-code-bg: #f5f7f9;
  --vx-focus: #0b6b88;
  --vx-radius-control: 8px;
  --vx-radius-panel: 12px;
  --vx-font:
    ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --vx-font-code:
    ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
:root:not([data-theme="light"]) {
    --vx-canvas: #0e1218;
    --vx-surface: #11161d;
    --vx-sunken: #0f141a;
    --vx-line: #1f2731;
    --vx-ink: #e7eaee;
    --vx-ink-muted: #9aa5b4;
    --vx-action: #5cc2e6;
    --vx-action-ink: #071016;
    --vx-action-soft: #14252e;
    --vx-attention: #f0a541;
    --vx-attention-soft: #2a2318;
    --vx-danger: #ff8a8d;
    --vx-danger-soft: #2e1a1e;
    --vx-success: #4fd1a5;
    --vx-success-soft: #16292a;
    --vx-structure: #0b0f14;
    --vx-raised: #192029;
    --vx-selected: #13212a;
    --vx-line-strong: #2a3542;
    --vx-line-control: #5e6d81;
    --vx-ink-subtle: #8290a1;
    --vx-code-bg: #0b0f14;
    --vx-focus: #5cc2e6;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --vx-canvas: #0e1218;
  --vx-surface: #11161d;
  --vx-sunken: #0f141a;
  --vx-line: #1f2731;
  --vx-ink: #e7eaee;
  --vx-ink-muted: #9aa5b4;
  --vx-action: #5cc2e6;
  --vx-action-ink: #071016;
  --vx-action-soft: #14252e;
  --vx-attention: #f0a541;
  --vx-attention-soft: #2a2318;
  --vx-danger: #ff8a8d;
  --vx-danger-soft: #2e1a1e;
  --vx-success: #4fd1a5;
  --vx-success-soft: #16292a;
  --vx-structure: #0b0f14;
  --vx-raised: #192029;
  --vx-selected: #13212a;
  --vx-line-strong: #2a3542;
  --vx-line-control: #5e6d81;
  --vx-ink-subtle: #8290a1;
  --vx-code-bg: #0b0f14;
  --vx-focus: #5cc2e6;
  color-scheme: dark;
}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--vx-canvas);color:var(--vx-ink);font:15px/1.5 var(--vx-font)}
a{color:var(--vx-action)}
:focus-visible{outline:2px solid var(--vx-focus);outline-offset:2px}
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem 1.25rem;padding:.75rem 1rem;border-bottom:1px solid var(--vx-line);background:var(--vx-surface)}
h1{font-size:1.125rem;margin:0}
h2{font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:var(--vx-ink-muted);margin:1.25rem 0 .5rem}
main,.layout{padding:1rem}
.layout{display:grid;grid-template-columns:minmax(16rem,22rem) minmax(0,1fr);gap:1.5rem;align-items:start}
.controls{background:var(--vx-surface);border:1px solid var(--vx-line);border-radius:var(--vx-radius-panel);padding:0 1rem 1rem}
.controls h2:first-child{margin-top:1rem}
.main{min-width:0}
.field{display:grid;gap:.25rem;margin:.5rem 0}
.field label{font-weight:500;font-size:.8125rem}
.field small,.muted{color:var(--vx-ink-muted);font-size:.8125rem}
.bad{color:var(--vx-danger);font-size:.8125rem}
input,select,textarea,button{font:inherit;color:var(--vx-ink);background:var(--vx-surface);border:1px solid var(--vx-line-control);border-radius:var(--vx-radius-control);padding:.375rem .5rem;min-height:2.25rem}
input[type=checkbox]{min-height:0;width:1.25rem;height:1.25rem}
textarea{font-family:var(--vx-font-code);font-size:.8125rem;width:100%;resize:vertical}
button{cursor:pointer}
button:hover{background:var(--vx-sunken)}
.presets{display:flex;gap:.5rem}
.problems:not(:empty){margin:1rem;padding:0 1rem 1rem;border:1px solid var(--vx-danger);background:var(--vx-danger-soft);border-radius:var(--vx-radius-panel);color:var(--vx-ink)}
.problems li{font-family:var(--vx-font-code);font-size:.8125rem;overflow-wrap:anywhere;margin:.25rem 0}
.stage{overflow:auto;padding:1rem;background:var(--vx-sunken);border:1px dashed var(--vx-line-strong);border-radius:var(--vx-radius-panel)}
.cell{position:relative;max-width:none;background:var(--vx-surface);border:1px solid var(--vx-line);border-radius:var(--vx-radius-panel);overflow:hidden}
.cell iframe{position:absolute;top:0;left:0;width:100%;border:0;background:transparent;display:block}
.status{position:absolute;inset:0;margin:0;display:flex;align-items:center;justify-content:center;color:var(--vx-ink-muted);pointer-events:none;text-align:center;padding:1rem}
.log{margin-top:1rem}
.log-list{list-style:none;margin:0;padding:0;border:1px solid var(--vx-line);border-radius:var(--vx-radius-panel);background:var(--vx-surface);max-height:18rem;overflow:auto}
.log-list:empty::before{content:"Nothing yet. Events the widget raises are listed here.";display:block;padding:.75rem 1rem;color:var(--vx-ink-muted)}
.entry{display:grid;grid-template-columns:auto auto 1fr;gap:.125rem .75rem;padding:.5rem 1rem;border-bottom:1px solid var(--vx-line);align-items:baseline}
.entry:last-child{border-bottom:0}
.entry code{grid-column:1/-1;font-family:var(--vx-font-code);font-size:.8125rem;overflow-wrap:anywhere;color:var(--vx-ink-muted)}
.entry .when{color:var(--vx-ink-subtle);font-size:.75rem}
.entry .verdict{font-size:.8125rem}
.entry.passed .verdict{color:var(--vx-success)}
.entry.dropped .verdict{color:var(--vx-danger)}
ul.widgets{list-style:none;margin:0;padding:0;display:grid;gap:.75rem;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))}
ul.widgets a{display:block;padding:1rem;background:var(--vx-surface);border:1px solid var(--vx-line);border-radius:var(--vx-radius-panel);text-decoration:none;color:var(--vx-ink)}
ul.widgets a:hover{border-color:var(--vx-action)}
ul.widgets span{display:block;color:var(--vx-ink-muted);font-size:.8125rem}
@media (max-width:860px){.layout{grid-template-columns:minmax(0,1fr)}.main{order:-1}main,.layout{padding:.75rem}}
@media (max-width:480px){.presets{flex-wrap:wrap}header{padding:.75rem}.stage{padding:.5rem}}
`;
