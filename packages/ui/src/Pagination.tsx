import { Button } from "./Button.tsx";

export interface PaginationProps {
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** Shown between the two buttons: "Page 2", "51 to 100". */
  label?: string;
}

/**
 * Moves through a list one page at a time. It asks only whether there is more
 * each way, which is all a cursor can say: there are no page numbers.
 */
export function Pagination({ hasPrevious, hasNext, onPrevious, onNext, label }: PaginationProps) {
  return (
    <nav aria-label="Pagination" class="flex items-center justify-between gap-3">
      <Button size="small" disabled={!hasPrevious} onClick={onPrevious}>
        Previous
      </Button>
      {label ? (
        <span aria-live="polite" class="text-[13px] text-ink-muted">
          {label}
        </span>
      ) : null}
      <Button size="small" disabled={!hasNext} onClick={onNext}>
        Next
      </Button>
    </nav>
  );
}
