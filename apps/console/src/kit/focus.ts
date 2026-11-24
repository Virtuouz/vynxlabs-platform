/**
 * Where the keyboard is after something a person opened has been done. A button that is disabled
 * while it works, or a row that the action removes, takes the focus with it and leaves the page
 * body: the next Tab then starts again from the top. `keepPlace` is called when the action starts,
 * with what opened it, and the function it returns when the action has been done.
 *
 * Focus goes back to what opened the action when that is still there. When it is not (its row is
 * gone), to the first control left in the list or section it was in, and else to the page's heading.
 */
export function keepPlace(opener: EventTarget | null): () => void {
  const from = opener instanceof HTMLElement ? opener : null;
  const home =
    from?.closest<HTMLElement>('[role="table"], table, ul, section, [role="region"]') ?? null;
  return () => {
    const settle = () => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return true;
      if (from?.isConnected && !(from as HTMLButtonElement).disabled) {
        from.focus();
        return true;
      }
      const near = home?.isConnected
        ? home.querySelector<HTMLElement>("button:not(:disabled), a[href]")
        : null;
      const heading = document.querySelector<HTMLElement>("main h1, [role='main'] h1, h1");
      const target = near ?? heading;
      if (!target) return false;
      if (target === heading && !target.hasAttribute("tabindex")) target.tabIndex = -1;
      target.focus();
      return true;
    };
    // What the action changed is drawn within the next frames: look again until the place is kept.
    let tries = 0;
    const again = () => {
      tries += 1;
      if (settle() && tries > 1) return;
      if (tries < 6) setTimeout(again, 40);
    };
    setTimeout(again, 0);
  };
}

/**
 * After a form refuses what was typed, the keyboard goes to the first field that carries the
 * refusal, so the reader is where the message is and a screen reader is told it. Fields the form
 * marks invalid (`aria-invalid`, which the kit's fields set when given an `error`) are looked for
 * once the refusal has been drawn.
 */
export function focusFirstInvalid(form: ParentNode | null | undefined): void {
  const look = () => form?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? null;
  const found = look();
  if (found) {
    found.focus();
    return;
  }
  // The message is drawn with the next render: look again once.
  setTimeout(() => look()?.focus(), 0);
}
