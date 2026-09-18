/**
 * The BörsBråket crown.
 *
 * Three hollow diamonds over a tapered body and a separate base bar,
 * redrawn from the supplied artwork as geometry rather than embedded as
 * a bitmap. A logo is the one image worth doing this way: it stays sharp
 * at 22px in the masthead and at 512px in a browser tab, it takes its
 * colour from the text beside it through currentColor, it costs about a
 * kilobyte inline instead of a network request, and it does not need a
 * second file for dark mode.
 *
 * app/icon.svg is the same drawing with a fixed colour, for the favicon.
 * The two are kept in step by hand; there are only a dozen numbers.
 *
 * If the original vector artwork turns up, dropping it in and pointing
 * the masthead at it is a one-line change.
 */

/** Half-diagonals and centres, so the three diamonds stay in proportion. */
const DIAMONDS: [cx: number, cy: number, half: number][] = [
  [21, 33, 13.5],
  [50, 24, 16],
  [79, 33, 13.5],
];

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 70" aria-hidden="true" focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="6.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {/* The body: down from the left diamond's outer vertex, across
            the base, back up to the right one's. */}
        <path d="M7.5 33 L26 55 H74 L92.5 33" />

        {DIAMONDS.map(([cx, cy, half]) => {
          // A diamond is a square on its corner: the side that gives a
          // half-diagonal of `half` is half*2/√2.
          const side = half * Math.SQRT2;
          return (
            <rect
              key={`${cx}-${cy}`}
              x={cx - side / 2}
              y={cy - side / 2}
              width={side}
              height={side}
              rx="3"
              transform={`rotate(45 ${cx} ${cy})`}
            />
          );
        })}

        {/* The band, a touch wider than the body's base. */}
        <path d="M23 63 H77" />
      </g>
    </svg>
  );
}
