import { Button, Notice, TextField } from "@vynxlabs/ui";
import { useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask } from "../ask.tsx";
import { type Branding, BrandMark, useBrand } from "../kit/brand.tsx";
import { PageHeader, Panel, SectionLabel } from "../kit/layout.tsx";
import { RemoveButton } from "../ListScreen.tsx";
import { refreshInstanceTheme } from "../theme.ts";
import { size } from "./Apps.tsx";
import { KIT, MAX_LOGO_BYTES, Preview, set, TokenRows } from "./Branding.tsx";

type Tokens = Record<string, string>;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/**
 * How the console looks on this instance: its name, its mark, and its colours.
 * A tenant's branding is for its own apps and portal and never reaches here.
 */
export function InstanceBranding() {
  const loaded = useLoad<Branding>("/instance/branding");
  if (loaded.error) {
    return (
      <Notice tone="danger" action={<Button onClick={loaded.reload}>Try again</Button>}>
        {loaded.error.message}
      </Notice>
    );
  }
  if (!loaded.data) return null;
  return <Editor stored={loaded.data} reload={loaded.reload} />;
}

function Editor({ stored, reload }: { stored: Branding; reload: () => void }) {
  const brand = useBrand();
  const [name, setName] = useState(stored.named ? stored.productName : "");
  const [light, setLight] = useState<Tokens>(stored.theme.tokens);
  const [dark, setDark] = useState<Tokens>(stored.theme.dark);
  const [error, setError] = useState<ApiError>();
  const [saved, setSaved] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [logoProblem, setLogoProblem] = useState<string>();

  const save = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setError(undefined);
    setSaved(undefined);
    try {
      const now = await api.put<Branding>("/instance/branding", body);
      setLight(now.theme.tokens);
      setDark(now.theme.dark);
      setName(now.named ? now.productName : "");
      setSaved(done);
      refreshInstanceTheme();
      brand.reload();
      reload();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setLogoProblem(undefined);
    if (!LOGO_TYPES.includes(file.type)) {
      setLogoProblem("Choose a PNG, JPEG, WebP or SVG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoProblem(`That image is ${size(file.size)}. A logo can be 512 KB at most.`);
      return;
    }
    try {
      await api.upload("/instance/branding/logo", file, "PUT");
      brand.reload();
      reload();
    } catch (caught) {
      setLogoProblem((caught as ApiError).message);
    }
  };

  const lightValues = { ...KIT.tokens, ...set(light) };
  const darkBase = { ...lightValues, ...KIT.dark };
  const darkValues = { ...darkBase, ...set(dark) };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Instance"
        title="Console branding"
        description="How this console looks to everyone who signs in to it: its name, its mark and its colours. Tenants brand their own apps and portal; that never changes the console."
      />

      <Panel className="flex flex-col gap-4 p-4">
        <SectionLabel>Name and mark</SectionLabel>
        <form
          className="flex flex-col gap-4 md:flex-row md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            save({ productName: name.trim() || null }, "Saved.");
          }}
        >
          <div className="min-w-0 flex-1 md:max-w-sm">
            <TextField
              label="Product name"
              name="productName"
              value={name}
              placeholder={stored.named ? "" : stored.productName}
              hint="Shown in the rail, on the sign-in screen and as the window's title. Empty uses the default."
              required={false}
              onChange={(value) => setName(value)}
            />
          </div>
          <Button type="submit" variant="primary" disabled={busy}>
            Save name
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-4">
          <BrandMark />
          {stored.logo ? (
            <RemoveButton
              label="Remove logo"
              confirm="Remove the logo? The console shows the name's initials instead."
              run={async () => {
                await api.delete("/instance/branding/logo");
                brand.reload();
              }}
              onDone={reload}
            />
          ) : (
            <span className="text-meta text-ink-muted">
              No logo: the mark is the name's initials.
            </span>
          )}
          <label className="flex flex-col gap-1 text-meta font-medium">
            {stored.logo ? "Replace the logo" : "Upload a logo"}
            <input
              type="file"
              accept={LOGO_TYPES.join(",")}
              className="font-normal"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) upload(file);
              }}
            />
            <span className="font-normal text-ink-muted">
              PNG, JPEG, WebP or SVG, up to 512 KB. Square works best.
            </span>
          </label>
        </div>
        {logoProblem ? <Notice tone="danger">{logoProblem}</Notice> : null}
      </Panel>

      <Panel className="flex flex-col gap-4 p-4">
        <SectionLabel>Colours, corners and fonts</SectionLabel>
        <p className="m-0 max-w-[75ch] text-ink-muted">
          Set a token to a plain colour, length or font list, or leave it empty to keep the
          console's own value. Production is always marked in the attention colour, so keep it
          clearly amber.
        </p>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save({ theme: { tokens: set(light), dark: set(dark) } }, "Saved.");
          }}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <TokenRows
              mode="tokens"
              values={light}
              effective={KIT.tokens}
              error={error}
              onChange={(token, value) => {
                setSaved(undefined);
                setLight((current) => ({ ...current, [token]: value }));
              }}
            />
            <TokenRows
              mode="dark"
              values={dark}
              effective={darkBase}
              error={error}
              onChange={(token, value) => {
                setSaved(undefined);
                setDark((current) => ({ ...current, [token]: value }));
              }}
            />
          </div>
          {error ? <Notice tone="danger">{error.message}</Notice> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              Save theme
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                const sure = await ask.confirm({
                  title: "Reset to the console's own values?",
                  text: "Every value set here is removed, for light and for dark.",
                  action: "Reset",
                  danger: true,
                });
                if (sure) save({ theme: { tokens: {}, dark: {} } }, "Reset.");
              }}
            >
              Reset colours
            </Button>
            {saved ? (
              <span role="status" className="text-ink-muted">
                {saved}
              </span>
            ) : null}
          </div>
        </form>
        <div className="grid gap-4 md:grid-cols-2">
          <Preview scheme="light" values={lightValues} />
          <Preview scheme="dark" values={darkValues} />
        </div>
      </Panel>
    </div>
  );
}
