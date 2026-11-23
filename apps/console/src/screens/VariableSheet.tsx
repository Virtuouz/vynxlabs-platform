import { Button, Notice, SideSheet, TextAreaField } from "@volvel/ui";
import { useState } from "react";
import { api } from "../api.ts";
import { failureText, notify } from "../ask.tsx";

/** What a variable row and a variable page both know about it. */
export interface VariableValue {
  path: string;
  description: string;
  default: string | null;
  value: string | null;
}

/**
 * Sets a variable's value in this workspace: from its row and from its page,
 * starting from the value it has now, over as many lines as the value needs.
 */
export function VariableSheet({
  root,
  variable,
  open = true,
  onClose,
  onSaved,
}: {
  root: string;
  variable: VariableValue;
  open?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(variable.value ?? "");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string>();
  const save = async () => {
    setSaving(true);
    setFailure(undefined);
    try {
      await api.put(`${root}/variable-values/${variable.path}`, { value });
      notify.success(`${variable.path} is set in this workspace.`);
      onSaved();
      onClose();
    } catch (error) {
      setFailure(failureText(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title={variable.value === null ? `Set ${variable.path}` : `Change ${variable.path}`}
      {...(variable.description ? { description: variable.description } : {})}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {failure ? <Notice tone="danger">{failure}</Notice> : null}
        <TextAreaField
          name="value"
          label="Value"
          rows={4}
          value={value}
          onChange={setValue}
          hint={
            variable.default !== null
              ? `The default is ${variable.default}. It applies when no value is set here.`
              : "No default is declared, so a script reading it without a value here gets nothing."
          }
        />
      </div>
    </SideSheet>
  );
}
