import { useLayoutEffect, useRef } from "react";

const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const FADE = [{ opacity: 0 }, { opacity: 1 }];
const reduced = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The picture of a pressed button that is in view: of a light and dark pair, the one the page shows. */
function seen(button: HTMLElement): HTMLImageElement | undefined {
  const pictures = [...button.querySelectorAll("img")];
  return pictures.find((one) => getComputedStyle(one).display !== "none") ?? pictures[0];
}

/** The words of a pressed picture: its own, or those of the other look of the pair. */
function wordsOf(button: HTMLElement): string {
  const picture = seen(button);
  return (
    picture?.getAttribute("alt") ||
    [...button.querySelectorAll("img")].map((one) => one.getAttribute("alt")).find(Boolean) ||
    ""
  );
}

/** The button of a picture that a press landed on, if it landed on one. */
export function zoomButton(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>("[data-vd-zoom]") : null;
}

const play = (
  node: HTMLElement | null,
  frames: Keyframe[],
  options: KeyframeAnimationOptions,
  pseudo?: boolean,
) => {
  if (!node || reduced() || typeof node.animate !== "function") return null;
  try {
    return node.animate(frames, pseudo ? { ...options, pseudoElement: "::backdrop" } : options);
  } catch {
    return null;
  }
};

/**
 * The larger view of a picture: the whole of it, fitted to the window, its words under it. It grows
 * from where the picture is and goes back there. The same elements and stylesheet as the served
 * site's script draws, so a page looks and behaves the same in a console's help.
 */
export function DocZoom({ opener, onClose }: { opener: HTMLElement; onClose: () => void }) {
  const box = useRef<HTMLDialogElement>(null);
  const big = useRef<HTMLImageElement>(null);
  const caption = useRef<HTMLElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const closing = useRef(false);
  const picture = seen(opener);
  const words = wordsOf(opener);
  const src = picture?.getAttribute("src") ?? "";
  const natural = picture && picture.naturalWidth > 0 ? picture : undefined;

  useLayoutEffect(() => {
    const dialog = box.current;
    const image = big.current;
    if (!dialog || !image) return;
    dialog.showModal();
    closer.current?.focus();
    const from = picture?.getBoundingClientRect();
    const to = image.getBoundingClientRect();
    const frames: Keyframe[] =
      from && from.width > 0 && to.width > 0
        ? [
            {
              transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
            },
            { transform: "none" },
          ]
        : [
            { opacity: 0, transform: "scale(0.96)" },
            { opacity: 1, transform: "none" },
          ];
    play(image, frames, { duration: 260, easing: EASE });
    play(dialog, FADE, { duration: 200, easing: EASE }, true);
    play(closer.current, FADE, { duration: 200, easing: EASE });
    play(caption.current, FADE, { duration: 200, easing: EASE });
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [picture]);

  const hide = () => {
    const dialog = box.current;
    const image = big.current;
    if (!dialog || !image || closing.current) return;
    closing.current = true;
    const finish = () => {
      onClose();
      if (opener.isConnected) opener.focus();
    };
    const back = seen(opener)?.getBoundingClientRect();
    const here = image.getBoundingClientRect();
    const inView =
      back &&
      back.width > 0 &&
      here.width > 0 &&
      back.bottom > 0 &&
      back.top < window.innerHeight &&
      back.right > 0 &&
      back.left < window.innerWidth;
    const frames: Keyframe[] = inView
      ? [
          { transform: "none" },
          {
            transform: `translate(${back.left - here.left}px, ${back.top - here.top}px) scale(${back.width / here.width}, ${back.height / here.height})`,
          },
        ]
      : [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "scale(0.96)" },
        ];
    const run = play(image, frames, { duration: 200, easing: EASE, fill: "forwards" });
    play(dialog, [...FADE].reverse(), { duration: 200, easing: EASE, fill: "forwards" }, true);
    play(closer.current, [...FADE].reverse(), { duration: 120, easing: EASE, fill: "forwards" });
    play(caption.current, [...FADE].reverse(), { duration: 120, easing: EASE, fill: "forwards" });
    if (run) {
      run.onfinish = finish;
      run.oncancel = finish;
    } else finish();
  };

  return (
    <dialog
      ref={box}
      className="vd-lightbox"
      aria-label={words || "Larger picture"}
      onCancel={(event) => {
        event.preventDefault();
        hide();
      }}
      onClick={(event) => {
        // A press anywhere but on the picture, its words or the button closes it.
        if (
          !(event.target instanceof Element) ||
          !event.target.closest(".vd-lightbox-img, .vd-lightbox-caption, .vd-lightbox-close")
        )
          hide();
      }}
      onKeyDown={(event) => {
        // Nothing else in it can take focus, so Tab stays on the one button.
        if (event.key === "Tab") {
          event.preventDefault();
          closer.current?.focus();
        }
      }}
    >
      <figure className="vd-lightbox-figure">
        <img
          ref={big}
          className="vd-lightbox-img"
          src={src}
          alt={words}
          {...(natural ? { width: natural.naturalWidth, height: natural.naturalHeight } : {})}
        />
        <figcaption
          ref={caption}
          className="vd-lightbox-caption"
          aria-hidden="true"
          hidden={!words}
        >
          {words}
        </figcaption>
      </figure>
      <button
        ref={closer}
        type="button"
        className="vd-lightbox-close"
        aria-label="Close"
        onClick={hide}
      >
        {"×"}
      </button>
    </dialog>
  );
}
