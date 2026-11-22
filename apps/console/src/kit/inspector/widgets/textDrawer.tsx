/**
 * Text's Content tab (board 19, right): the callout style chosen by looking at it, then the
 * words. They are written where they appear (the on-page editor, with a small toolbar); the
 * Markdown row opens the documentation's editor in a large dialog, for steps, tabs and folds.
 */
import { Button, Dialog, DrawerRow, Markdown, TilePicker } from "@volvel/ui";
import { Hash, Pencil } from "lucide-react";
import { useState } from "react";
import { MarkdownEditor } from "../../markdown/MarkdownEditor.tsx";
import { useEditOnPage } from "../../markdown/onThePage.ts";
import { type Env, Group, setConfig } from "./recordShared.tsx";

export type TextLook = "plain" | "note" | "warning" | "tip";

const LOOKS: { value: TextLook; label: string; face: string }[] = [
  { value: "plain", label: "Plain", face: "border border-dashed border-line-strong" },
  { value: "note", label: "Note", face: "border border-line border-l-4 border-l-action" },
  { value: "warning", label: "Warning", face: "border border-line border-l-4 border-l-attention" },
  { value: "tip", label: "Tip", face: "border border-line border-l-4 border-l-success" },
];

/** One callout style drawn as the callout: for a tile. */
export function CalloutPreview({ look }: { look: string }) {
  const face = LOOKS.find((one) => one.value === look)?.face ?? LOOKS[0]?.face;
  return <span aria-hidden="true" className={`block h-8 w-full rounded-inner ${face}`} />;
}

/** The callout styles, each drawn as the callout. */
export function LookTiles({
  value,
  onChange,
}: {
  value: TextLook;
  onChange: (next: TextLook) => void;
}) {
  return (
    <TilePicker<TextLook>
      label="Style"
      columns={4}
      value={value}
      onChange={onChange}
      options={LOOKS.map((one) => ({
        value: one.value,
        label: one.label,
        preview: (
          <span aria-hidden="true" className={`block h-8 w-full rounded-inner ${one.face}`} />
        ),
      }))}
    />
  );
}

export function TextContentSection({ env }: { env: Env }) {
  const edit = useEditOnPage();
  const [large, setLarge] = useState(false);
  const text = typeof env.config.text === "string" ? env.config.text : "";
  const look = (
    LOOKS.some((one) => one.value === env.config.look) ? env.config.look : "plain"
  ) as TextLook;
  return (
    <>
      <Group label="Style">
        <div className="px-3 py-3">
          <LookTiles
            value={look}
            onChange={(next) =>
              setConfig(env, "look", next === "plain" ? undefined : next, "its style")
            }
          />
        </div>
      </Group>
      <Group
        label="Text"
        note="Text is written where it appears, with a small toolbar. The style replaces typing :::alert by hand."
      >
        <div className="flex flex-col gap-3 px-3 py-3">
          {text.trim() ? (
            <div className="max-h-40 overflow-hidden text-body-sm text-ink">
              <Markdown text={text} profile="page" />
            </div>
          ) : (
            <p className="m-0 text-body-sm text-ink-muted">Nothing written yet.</p>
          )}
          {edit ? (
            <div>
              <Button size="small" variant="primary" onClick={() => edit(env.widget.id)}>
                <Pencil aria-hidden="true" size={14} /> Edit on the page
              </Button>
            </div>
          ) : (
            <div>
              <Button size="small" variant="primary" onClick={() => setLarge(true)}>
                <Pencil aria-hidden="true" size={14} /> Edit the text
              </Button>
            </div>
          )}
        </div>
        <DrawerRow
          label="Markdown"
          icon={Hash}
          value="For steps, tabs and folds"
          onClick={() => setLarge(true)}
        />
      </Group>
      <Dialog
        open={large}
        onClose={() => setLarge(false)}
        title="Text"
        description="Markdown, with the documentation's alerts, steps, tabs and folds."
      >
        <MarkdownEditor
          profile="page"
          label="Text"
          value={text}
          onChange={(next) => setConfig(env, "text", next, "the text", true)}
          height="60vh"
          modes={["source", "split", "preview"]}
          path={`widget/${env.widget.id}/text.md`}
        />
      </Dialog>
    </>
  );
}
