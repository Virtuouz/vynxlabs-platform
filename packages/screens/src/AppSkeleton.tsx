/**
 * What the served app draws before its pages are known (the first load, with the files still
 * on their way): the shape of a typical page, as the kit's skeletons, so that what comes in
 * takes the place of something and nothing moves under the reader's eye. `runtime/index.html`
 * holds the same markup for the moment before the script runs; keep the two alike.
 */
const SHAPE = "animate-pulse rounded-control bg-sunken motion-reduce:animate-none";

export function AppSkeleton({ pages }: { pages?: readonly { id: string; title: string }[] }) {
  return (
    <div
      role="status"
      aria-label="Loading the app"
      data-app-skeleton=""
      className="flex flex-col gap-4"
    >
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="flex gap-2">
        {pages && pages.length > 0
          ? // The names of the pages are known from the first answer: they are said while the rest comes.
            pages.map((one) => (
              <span
                key={one.id}
                className="inline-flex h-8 items-center px-3 text-body font-medium text-ink-muted"
              >
                {one.title}
              </span>
            ))
          : ["w-24", "w-20", "w-28", "w-20"].map((width, at) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
              <div key={at} className={`${SHAPE} h-8 ${width}`} />
            ))}
      </div>
      <div aria-hidden="true" className={`${SHAPE} h-12 w-full`} />
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((at) => (
          <div key={at} className={`${SHAPE} h-24 rounded-panel`} />
        ))}
      </div>
      <div aria-hidden="true" className={`${SHAPE} h-72 w-full rounded-panel`} />
    </div>
  );
}
