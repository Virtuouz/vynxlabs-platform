/**
 * Words with the record's fields written into them as tokens: "Mark [Number] as paid?" (board 4).
 * It is stored as `Mark {number} as paid?`; here each `{column}` is a chip that is deleted as one
 * piece, and "+ Field" inserts another where the caret is. The words are edited in place.
 */
import { Menu } from "@volvel/ui";
import { useLayoutEffect, useRef } from "react";
import { heading } from "./model.ts";
import { parseTokens } from "./timelineModel.ts";

const TOKEN_CLASS =
  "mx-0.5 inline-flex h-6 items-center rounded-control border border-action bg-action-soft px-2 align-baseline text-body-sm text-action select-none";

function tokenNode(name: string, label: string): HTMLElement {
  const node = document.createElement("span");
  node.contentEditable = "false";
  node.dataset.field = name;
  node.className = TOKEN_CLASS;
  node.textContent = label;
  return node;
}

/** What the editable element holds, as it is stored. */
export function readTokens(root: HTMLElement): string {
  let text = "";
  for (const node of Array.from(root.childNodes)) {
    if (node instanceof HTMLElement && node.dataset.field) text += `{${node.dataset.field}}`;
    else if (node.nodeName === "BR") continue;
    else text += (node.textContent ?? "").replace(/ /g, " ");
  }
  return text;
}

export interface TokenField {
  name: string;
  label?: string;
}

export function TokenText({
  label,
  value,
  fields,
  onChange,
  placeholder,
  maxLength,
}: {
  /** Names it to a screen reader. */
  label: string;
  value: string;
  /** The columns "+ Field" offers. */
  fields: readonly TokenField[];
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const caret = useRef<Range | undefined>(undefined);
  const labelOf = (name: string) => fields.find((one) => one.name === name)?.label ?? heading(name);

  // The element is the editor; the value is written into it only when it differs from what is there.
  // biome-ignore lint/correctness/useExhaustiveDependencies: labels change with the fields
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || readTokens(el) === value) return;
    el.replaceChildren(
      ...parseTokens(value).map((part) =>
        "field" in part
          ? tokenNode(part.field, labelOf(part.field))
          : document.createTextNode(part.text),
      ),
    );
  }, [value, fields]);

  const read = () => {
    const el = box.current;
    if (!el) return;
    const next = readTokens(el);
    if (maxLength !== undefined && next.length > maxLength) return;
    if (next !== value) onChange(next);
  };
  const remember = () => {
    const selection = window.getSelection();
    const el = box.current;
    if (selection && selection.rangeCount > 0 && el?.contains(selection.anchorNode)) {
      caret.current = selection.getRangeAt(0).cloneRange();
    }
  };
  const insert = (field: TokenField) => {
    const el = box.current;
    if (!el) return;
    const node = tokenNode(field.name, field.label ?? heading(field.name));
    const range = caret.current;
    if (range && el.contains(range.startContainer)) {
      range.deleteContents();
      range.insertNode(node);
    } else {
      el.append(node);
    }
    node.after(document.createTextNode(" "));
    caret.current = undefined;
    read();
    el.focus();
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {/* biome-ignore lint/a11y/useSemanticElements: tokens inside text need contenteditable */}
      <div
        ref={box}
        role="textbox"
        tabIndex={0}
        aria-label={label}
        aria-multiline="false"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={read}
        onBlur={() => {
          remember();
          read();
        }}
        onKeyUp={remember}
        onMouseUp={remember}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        onPaste={(event) => {
          event.preventDefault();
          document.execCommand?.(
            "insertText",
            false,
            event.clipboardData.getData("text/plain").replace(/\s+/g, " "),
          );
        }}
        className="min-h-8 rounded-control border border-transparent px-1.5 py-1 text-body-sm leading-7 text-ink outline-offset-2 hover:border-line focus:border-line-control focus-visible:outline-2 focus-visible:outline-focus empty:before:text-ink-subtle empty:before:content-[attr(data-placeholder)]"
      />
      {fields.length > 0 ? (
        <div>
          <Menu
            ariaLabel={`Insert a field into ${label}`}
            label="+ Field"
            triggerClassName="inline-flex h-6 cursor-pointer items-center rounded-control px-1.5 text-meta text-ink-muted hover:text-ink"
            items={fields.map((field) => ({
              label: field.label ?? heading(field.name),
              onSelect: () => insert(field),
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}
