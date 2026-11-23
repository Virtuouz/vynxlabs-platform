/**
 * A number over time as one small line, with no axes: for under a figure,
 * where the shape matters and the values are read elsewhere. It takes the
 * color of the text around it. To a screen reader it is a picture with
 * `label` as its words, so the label says what the line shows: "Loans over
 * the last 12 weeks: from 18 to 31, lowest 12, highest 46".
 */
export function Sparkline({
  values,
  label,
  height = 32,
  className = "",
}: {
  values: readonly number[];
  label: string;
  /** In pixels. It is as wide as what it is in. */
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  // Drawn in a box 100 wide and stretched to its width; the stroke keeps its own thickness.
  const points = values.map((value, at) => {
    const x = (at / (values.length - 1)) * 100;
    // A little room above and below, so the line's thickness is not cut at its extremes.
    const y = 2 + (1 - (value - low) / span) * (height - 4);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      className={`block overflow-visible ${className}`}
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
