import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import { useState } from "react";
import { Button } from "./Button.tsx";

export interface MoveButtonsProps {
  /** What is moved, as its buttons name it: "Move Status up". */
  label: string;
  /** Where it is among the others, from 0, and how many there are. */
  at: number;
  count: number;
  onMove: (by: -1 | 1) => void;
  /** A list runs down the page; things placed along a row are moved earlier and later. */
  along?: "list" | "row";
  disabled?: boolean;
}

/**
 * The two buttons that move one thing a place among the others, for whoever
 * does not drag. They say aloud where it went. The things they move are held
 * by an element with `useFlip`'s ref and carry a `data-flip-key`, so the move
 * is seen as a move: every reordering by button in the console and in apps is
 * these two together.
 */
export function MoveButtons({
  label,
  at,
  count,
  onMove,
  along = "list",
  disabled,
}: MoveButtonsProps) {
  const [said, setSaid] = useState("");
  const [back, forth] = along === "row" ? ["earlier", "later"] : ["up", "down"];
  const Back = along === "row" ? ArrowLeft : ArrowUp;
  const Forth = along === "row" ? ArrowRight : ArrowDown;
  const move = (by: -1 | 1) => {
    onMove(by);
    setSaid(`${label} is now ${at + by + 1} of ${count}.`);
  };
  return (
    <>
      <Button
        size="small"
        variant="quiet"
        aria-label={`Move ${label} ${back}`}
        disabled={disabled || at <= 0}
        onClick={() => move(-1)}
      >
        <Back aria-hidden="true" size={14} />
      </Button>
      <Button
        size="small"
        variant="quiet"
        aria-label={`Move ${label} ${forth}`}
        disabled={disabled || at >= count - 1}
        onClick={() => move(1)}
      >
        <Forth aria-hidden="true" size={14} />
      </Button>
      <span role="status" className="sr-only">
        {said}
      </span>
    </>
  );
}
