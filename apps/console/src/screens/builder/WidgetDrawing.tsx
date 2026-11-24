import type { Drawing } from "./selectorData.ts";

/**
 * A small drawing of a widget, in the selector's preview pane (board 7): bars for a
 * chart, rows for a table. Simple shapes in the theme's own colors, so it follows
 * light and dark. It is a picture, not the widget: it reads nothing.
 */
export function WidgetDrawing({ drawing }: { drawing: Drawing }) {
  return (
    <svg
      viewBox="0 0 240 150"
      role="img"
      aria-label={`A drawing of ${drawing === "generic" ? "a widget" : `a ${drawing}`}`}
      data-drawing={drawing}
      className="block h-auto w-full rounded-panel border border-line bg-sunken"
    >
      <title>{`A drawing of ${drawing === "generic" ? "a widget" : `a ${drawing}`}`}</title>
      {SHAPES[drawing]}
    </svg>
  );
}

const A = "fill-action";
const SOFT = "fill-action opacity-40";
const LINE = "fill-line-strong";
const FAINT = "fill-line";
const CARD = "fill-raised stroke-line";

const SHAPES: Record<Drawing, React.ReactNode> = {
  chart: (
    <>
      <rect x="20" y="75" width="30" height="55" rx="3" className={SOFT} />
      <rect x="62" y="22" width="30" height="108" rx="3" className={A} />
      <rect x="104" y="58" width="30" height="72" rx="3" className={SOFT} />
      <rect x="146" y="40" width="30" height="90" rx="3" className={SOFT} />
      <rect x="188" y="70" width="30" height="60" rx="3" className={SOFT} />
    </>
  ),
  table: (
    <>
      <rect x="16" y="18" width="208" height="16" rx="3" className={LINE} />
      {[0, 1, 2, 3, 4].map((row) => (
        <g key={row}>
          <rect x="16" y={42 + row * 20} width="208" height="14" rx="3" className={FAINT} />
          <rect x="24" y={46 + row * 20} width="40" height="6" rx="2" className={LINE} />
          <rect x="92" y={46 + row * 20} width="48" height="6" rx="2" className={LINE} />
          <rect
            x="176"
            y={46 + row * 20}
            width="36"
            height="6"
            rx="3"
            className={row === 1 ? A : SOFT}
          />
        </g>
      ))}
    </>
  ),
  list: (
    <>
      {[0, 1, 2].map((row) => (
        <g key={row}>
          <rect x="16" y={16 + row * 42} width="208" height="34" rx="5" className={CARD} />
          <rect x="28" y={26 + row * 42} width="70" height="7" rx="2" className={LINE} />
          <rect x="28" y={38 + row * 42} width="44" height="5" rx="2" className={FAINT} />
          <rect x="178" y={28 + row * 42} width="34" height="10" rx="5" className={SOFT} />
        </g>
      ))}
    </>
  ),
  detail: (
    <>
      <rect x="16" y="14" width="208" height="122" rx="6" className={CARD} />
      <rect x="28" y="26" width="64" height="10" rx="2" className={LINE} />
      <rect x="170" y="26" width="42" height="12" rx="6" className={SOFT} />
      <rect x="28" y="48" width="44" height="14" rx="4" className={A} />
      <rect x="78" y="48" width="44" height="14" rx="4" className={FAINT} />
      {[0, 1, 2, 3].map((cell) => (
        <g key={cell}>
          <rect
            x={28 + (cell % 2) * 96}
            y={78 + Math.floor(cell / 2) * 28}
            width="30"
            height="5"
            rx="2"
            className={FAINT}
          />
          <rect
            x={28 + (cell % 2) * 96}
            y={88 + Math.floor(cell / 2) * 28}
            width="56"
            height="7"
            rx="2"
            className={LINE}
          />
        </g>
      ))}
    </>
  ),
  form: (
    <>
      {[0, 1, 2].map((row) => (
        <g key={row}>
          <rect x="24" y={16 + row * 36} width="40" height="5" rx="2" className={FAINT} />
          <rect x="24" y={26 + row * 36} width="192" height="18" rx="4" className={CARD} />
        </g>
      ))}
      <rect x="150" y="124" width="66" height="18" rx="4" className={A} />
    </>
  ),
  stat: (
    <>
      <rect x="16" y="14" width="208" height="122" rx="6" className={CARD} />
      <rect x="30" y="28" width="56" height="7" rx="2" className={FAINT} />
      <rect x="30" y="50" width="120" height="30" rx="4" className={A} />
      <rect x="30" y="94" width="74" height="6" rx="2" className={FAINT} />
      <rect x="30" y="108" width="40" height="10" rx="5" className={SOFT} />
    </>
  ),
  pivot: (
    <>
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3, 4].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={22 + col * 40}
            y={18 + row * 30}
            width="36"
            height="26"
            rx="3"
            className={row === 0 || col === 0 ? LINE : A}
            opacity={row === 0 || col === 0 ? 1 : 0.15 + ((row * 5 + col * 3) % 7) / 10}
          />
        )),
      )}
    </>
  ),
  goal: (
    <>
      <rect x="30" y="34" width="90" height="10" rx="3" className={LINE} />
      <rect x="30" y="56" width="140" height="28" rx="4" className={LINE} />
      <rect x="30" y="100" width="180" height="12" rx="6" className={FAINT} />
      <rect x="30" y="100" width="118" height="12" rx="6" className={A} />
    </>
  ),
  button: (
    <>
      <rect x="62" y="56" width="116" height="38" rx="8" className={A} />
      <rect x="84" y="71" width="72" height="8" rx="3" className="fill-surface" />
    </>
  ),
  actions: (
    <>
      <rect x="20" y="58" width="62" height="32" rx="7" className={A} />
      <rect x="92" y="58" width="62" height="32" rx="7" className={CARD} />
      <rect x="164" y="58" width="56" height="32" rx="7" className={CARD} />
    </>
  ),
  approvals: (
    <>
      {[0, 1, 2].map((row) => (
        <g key={row}>
          <rect
            x="14"
            y={18 + row * 40}
            width="78"
            height="32"
            rx="5"
            className={row === 0 ? "fill-action opacity-20 stroke-action" : CARD}
          />
          <rect x="22" y={26 + row * 40} width="48" height="6" rx="2" className={LINE} />
          <rect x="22" y={38 + row * 40} width="30" height="5" rx="2" className={FAINT} />
        </g>
      ))}
      <rect x="104" y="18" width="122" height="112" rx="6" className={CARD} />
      <rect x="116" y="30" width="62" height="9" rx="2" className={LINE} />
      <rect x="116" y="48" width="42" height="14" rx="4" className={FAINT} />
      <rect x="164" y="48" width="42" height="14" rx="4" className={FAINT} />
      <rect x="116" y="100" width="48" height="18" rx="5" className={A} />
      <rect x="170" y="100" width="48" height="18" rx="5" className="fill-surface stroke-danger" />
    </>
  ),
  section: (
    <>
      <rect x="16" y="16" width="90" height="9" rx="3" className={LINE} />
      <rect
        x="16"
        y="36"
        width="208"
        height="98"
        rx="6"
        className="fill-none stroke-line-strong"
        strokeDasharray="4 4"
      />
      <rect x="28" y="48" width="56" height="30" rx="4" className={CARD} />
      <rect x="92" y="48" width="56" height="30" rx="4" className={CARD} />
      <rect x="156" y="48" width="56" height="30" rx="4" className={CARD} />
      <rect x="28" y="88" width="184" height="34" rx="4" className={CARD} />
    </>
  ),
  tabs: (
    <>
      <rect x="16" y="20" width="52" height="12" rx="3" className={A} />
      <rect x="76" y="20" width="52" height="12" rx="3" className={FAINT} />
      <rect x="136" y="20" width="52" height="12" rx="3" className={FAINT} />
      <rect x="16" y="38" width="208" height="2" className={LINE} />
      <rect x="16" y="52" width="208" height="82" rx="6" className={CARD} />
    </>
  ),
  filter: (
    <>
      <rect x="16" y="52" width="94" height="30" rx="6" className={CARD} />
      <rect x="28" y="62" width="50" height="8" rx="2" className={FAINT} />
      <rect x="118" y="52" width="50" height="30" rx="6" className={CARD} />
      <rect x="174" y="52" width="50" height="30" rx="6" className={CARD} />
    </>
  ),
  text: (
    <>
      <rect x="24" y="26" width="100" height="10" rx="3" className={LINE} />
      <rect x="24" y="48" width="192" height="6" rx="2" className={FAINT} />
      <rect x="24" y="62" width="176" height="6" rx="2" className={FAINT} />
      <rect x="24" y="76" width="188" height="6" rx="2" className={FAINT} />
      <rect x="24" y="96" width="192" height="30" rx="5" className={SOFT} />
    </>
  ),
  generic: (
    <>
      <rect x="40" y="30" width="160" height="90" rx="8" className={CARD} />
      <rect x="60" y="52" width="80" height="8" rx="3" className={LINE} />
      <rect x="60" y="72" width="120" height="6" rx="2" className={FAINT} />
    </>
  ),
};
