import { Button, type JsonSchema, Notice, SchemaForm, SideSheet, TextField } from "@volvel/ui";
import { useState } from "react";
import { api } from "../api.ts";
import { failureText } from "../ask.tsx";
import { SecretField } from "../kit/SecretField.tsx";
import { addressChanged } from "./ConnectionWizard.tsx";

/** A member of a connection group, as the list has it. */
export interface GroupMemberRow {
  key: string;
  label: string;
  config: Record<string, unknown>;
  hasCredential: boolean;
  credentialSetAt?: string | null;
  credentialSetBy?: string | null;
}

/**
 * Adds a member to a connection group, or changes one. Its settings are the
 * group's connector's, drawn from the schema the group gives, and its credential
 * is kept the way a connection's is: what is stored is never shown, and leaving
 * it empty keeps it.
 */
export function GroupMemberSheet({
  root,
  group,
  schema,
  member,
  open,
  onClose,
  onSaved,
}: {
  root: string;
  group: string;
  schema: Record<string, unknown>;
  /** The member being changed. None for a new one. */
  member?: GroupMemberRow | undefined;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [key, setKey] = useState(member?.key ?? "");
  const [label, setLabel] = useState(member?.label ?? "");
  const [config, setConfig] = useState<Record<string, unknown>>(member?.config ?? {});
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  // Another address keeps no credential that was given for the old one (D10), as in the wizard.
  const addressMoved =
    member !== undefined &&
    member.hasCredential &&
    credential === "" &&
    addressChanged(member.config, config);

  const save = async () => {
    setProblem(undefined);
    if (!key.trim()) {
      setProblem("Give the member a key: what a script asks for.");
      return;
    }
    setBusy(true);
    try {
      await api.put(`${root}/connection-group-members/${encodeURIComponent(key.trim())}/${group}`, {
        label,
        config,
        ...(credential ? { credential } : {}),
      });
      onSaved();
    } catch (error) {
      setProblem(failureText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SideSheet
      open={open}
      onClose={onClose}
      size="wide"
      title={member ? `Change ${member.key}` : "Add a member"}
      description={`To ${group}. It is used from the next run, with no deploy.`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Key"
            name="key"
            value={key}
            placeholder="acme-north"
            hint={
              member
                ? "A key is what a script asks for, so it cannot change. Add another member to use a new one."
                : "What a script asks for: a customer's ID, a region, a shop's name."
            }
            disabled={member !== undefined}
            onChange={setKey}
          />
          <TextField
            label="Name"
            name="label"
            value={label}
            placeholder="Acme, northern shop"
            onChange={setLabel}
          />
        </div>
        <SchemaForm
          schema={schema as JsonSchema}
          value={config}
          onChange={(value) => setConfig((value ?? {}) as Record<string, unknown>)}
        />
        {addressMoved ? (
          <Notice tone="attention">
            The address changed. Save removes the stored credential, which was given for the old
            one: enter it again to keep using this member.
          </Notice>
        ) : null}
        <SecretField
          label="Credential"
          name="credential"
          stored={member?.hasCredential ?? false}
          setAt={member?.credentialSetAt}
          setBy={member?.credentialSetBy}
          value={credential}
          hint="Sent the way the settings say. Stored encrypted and never shown again. Pointing the member at another address removes the stored one unless you enter it again."
          onChange={setCredential}
        />
      </div>
    </SideSheet>
  );
}
