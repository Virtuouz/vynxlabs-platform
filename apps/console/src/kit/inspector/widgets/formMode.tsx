/**
 * Form's "What it does" (Data tab), drawn as radio cards as Record detail's "Shows" is: the
 * words say what the form does with the table's record, and the second is only for a page that
 * has a record open (a record page, a side sheet or a modal).
 */
import { RadioCards } from "@volvel/ui";
import type { Env } from "../controls.tsx";
import { withConfig } from "../model.ts";
import { opensOnRecord } from "./detailDrawer.tsx";

type Mode = "create" | "edit";

export function FormMode({ env }: { env: Env }) {
  const value: Mode = env.config.mode === "edit" ? "edit" : "create";
  return (
    <RadioCards<Mode>
      label="What it does"
      value={value}
      onChange={(next) =>
        env.write(
          withConfig(env.widget, "mode", next),
          "changing what the form does",
          `config:${env.widget.id}:mode`,
        )
      }
      options={[
        {
          value: "create",
          title: "Makes a new record",
          line: "Starts empty. Saving adds a row to the table.",
        },
        {
          value: "edit",
          title: "Changes the record that is open",
          line: opensOnRecord(env)
            ? "Starts with its values. Saving changes only what was changed."
            : "Only on a record page, a side sheet or a modal",
          disabled: !opensOnRecord(env) && value !== "edit",
        },
      ]}
    />
  );
}
