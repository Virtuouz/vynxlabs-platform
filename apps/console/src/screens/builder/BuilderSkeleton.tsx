/**
 * The builder's frame before its page is read: the header row, the left pane, the canvas and the
 * settings pane, as quiet blocks, all at once and at once on arrival. Never a blank screen: on a
 * slow line the script and the first reads can take many seconds, and this is what stands there.
 * It has the builder's own proportions (board 1), so what replaces it does not shift.
 */
export function BuilderSkeleton() {
  const block = "animate-pulse rounded-control bg-sunken motion-reduce:animate-none";
  return (
    <section
      role="status"
      aria-label="Loading the builder"
      data-builder-skeleton=""
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex h-12 shrink-0 items-center gap-3 border-line border-b px-4">
        <div className={`${block} h-5 w-44`} />
        <div className={`${block} h-4 w-24 max-sm:hidden`} />
        <div className="ml-auto flex items-center gap-2">
          <div className={`${block} h-8 w-56 max-lg:hidden`} />
          <div className={`${block} h-8 w-24`} />
          <div className={`${block} h-8 w-20`} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-72 shrink-0 flex-col gap-2 border-line border-r p-3 max-lg:hidden">
          <div className={`${block} h-4 w-16`} />
          {Array.from({ length: 5 }, (_, at) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            <div key={at} className={`${block} h-7 w-full`} />
          ))}
          <div className={`${block} mt-3 h-4 w-24`} />
          {Array.from({ length: 6 }, (_, at) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            <div key={at} className={`${block} h-6 ${at % 3 === 2 ? "w-3/4" : "w-full"}`} />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <div className={`${block} h-10 w-full`} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, at) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
              <div key={at} className={`${block} h-28 ${at > 1 ? "max-sm:hidden" : ""}`} />
            ))}
          </div>
          <div className={`${block} h-64 w-full`} />
          <div className={`${block} h-40 w-full`} />
        </div>
        <div className="flex w-[22rem] shrink-0 flex-col gap-3 border-line border-l p-4 max-xl:hidden">
          <div className={`${block} h-10 w-full`} />
          <div className={`${block} h-8 w-full`} />
          {Array.from({ length: 4 }, (_, at) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            <div key={at} className={`${block} h-9 w-full`} />
          ))}
        </div>
      </div>
    </section>
  );
}
