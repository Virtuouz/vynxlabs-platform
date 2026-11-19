import { FieldHelp, Toggletip } from "@volvel/ui";
import { type ReactNode, useEffect, useState } from "react";
import { loadFields } from "./content.ts";

let known: Record<string, string> | undefined;

/** What a kind's schema says of one of its fields, once the descriptions have been fetched. */
export function useFieldDescription(path: string): string | undefined {
  const [fields, setFields] = useState(known);
  useEffect(() => {
    if (known) return;
    let current = true;
    loadFields().then(
      (loaded) => {
        known = loaded;
        if (current) setFields(loaded);
      },
      // Without them a form is the form it was.
      () => {},
    );
    return () => {
      current = false;
    };
  }, []);
  return fields?.[path];
}

/**
 * Around a field of a form written by hand: an ⓘ beside its label that says
 * what the kind's own schema says of the field, so the form and the reference
 * cannot say two things. `path` is the kind, then the way to the field:
 * `schedule.overlap`, `table.columns.*.onDelete`.
 */
export function FieldAbout({
  path,
  name,
  children,
}: {
  path: string;
  /** What the field is called on the form, to name the ⓘ. */
  name: string;
  children: ReactNode;
}) {
  const description = useFieldDescription(path);
  if (!description) return <>{children}</>;
  return (
    <FieldHelp
      help={
        <Toggletip label={`About ${name}`} title={name}>
          {description}
        </Toggletip>
      }
    >
      {children}
    </FieldHelp>
  );
}

/** For tests: forget what was fetched. */
export function forgetFields() {
  known = undefined;
}
