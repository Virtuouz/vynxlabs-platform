import { Button, Notice, TextField } from "@volvel/ui";
import { useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { type Branding, BrandMark, useBrand } from "../kit/brand.tsx";
import { Can } from "../kit/Can.tsx";
import { sendIcons } from "../kit/icons.ts";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { PageHeader, Panel, SectionLabel } from "../kit/layout.tsx";
import { SaveBar } from "../kit/SaveBar.tsx";
import { RemoveButton } from "../ListScreen.tsx";
import { refreshInstanceTheme } from "../theme.ts";
import { size } from "./Apps.tsx";
import { KIT, MAX_LOGO_BYTES, Preview, set, TokenRows } from "./Branding.tsx";

type Tokens = Record<string, string>;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/**
 * How the console looks on this instance: its name, its mark, and its colors.
 * A tenant's branding is for its own apps and portal and never reaches here.
 */
export function InstanceBranding() {
  const loaded = useLoad<Branding>("/instance/branding");
  if (loaded.error) {
    return <ErrorState error={loaded.error} onRetry={loaded.reload} />;
  }
  if (!loaded.data) return <Loading />;
  return (
    <Can base="/instance" permission="instance:write" what="how this instance's console looks">
      <Editor stored={loaded.data} reload={loaded.reload} />
    </Can>
  );
}

function Editor({ stored, reload }: { stored: Branding; reload: () => void }) {
  const brand = useBrand();
  const [name, setName] = useState(stored.named ? stored.productName : "");
  const [light, setLight] = useState<Tokens>(stored.theme.tokens);
  const [dark, setDark] = useState<Tokens>(stored.theme.dark);
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);
  const [logoProblem, setLogoProblem] = useState<string>();
  const storedName = stored.named ? stored.productName : "";
  const same = (one: Tokens, two: Tokens) => JSON.stringify(set(one)) === JSON.stringify(set(two));
  const dirty =
    name.trim() !== storedName ||
    !same(light, stored.theme.tokens) ||
    !same(dark, stored.theme.dark);
  const discard = () => {
    setName(storedName);
    setLight(stored.theme.tokens);
    setDark(stored.theme.dark);
    setError(undefined);
  };

  /** The name and the colors, saved together. */
  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const now = await api.put<Branding>("/instance/branding", {
        productName: name.trim() || null,
        theme: { tokens: set(light), dark: set(dark) },
      });
      setLight(now.theme.tokens);
      setDark(now.theme.dark);
      setName(now.named ? now.productName : "");
      notify.success("The console's branding is saved. Everyone sees it on their next page.");
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
      notify.success("The logo is replaced.");
      // The icons for the tab and the home screen are drawn from it here, by the browser, once
      // the logo itself is in place: a logo is not held up by its icons.
      void sendIcons(file, "/instance/branding/icons", (path, body) =>
        api.upload(path, new File([body], "icon.png", { type: "image/png" }), "PUT"),
      ).catch(() =>
        notify.info("The icons could not be made from the logo, so the tab keeps the icon it had."),
      );
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
        description="How this console looks to everyone who signs in to it: its name, its mark and its colors. Tenants brand their own apps and portal; that never changes the console. Changes are saved together, from the bar that appears below."
      />

      <Panel className="flex flex-col gap-4 p-4">
        <SectionLabel>Name and mark</SectionLabel>
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
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
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <BrandMark />
          {stored.logo ? (
            <RemoveButton
              label="Remove logo"
              confirm="Remove the logo? The console shows the name's initials instead."
              run={async () => {
                await api.delete("/instance/branding/logo");
                await api.delete("/instance/branding/icons");
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
              PNG, JPEG, WebP or SVG, up to 512 KB. Square works best. Choosing one replaces the
              logo at once.
            </span>
          </label>
        </div>
        {logoProblem ? <Notice tone="danger">{logoProblem}</Notice> : null}
      </Panel>

      <Panel className="flex flex-col gap-4 p-4">
        <SectionLabel>Colors, corners and fonts</SectionLabel>
        <p className="m-0 max-w-measure text-ink-muted">
          Set a token to a plain color, length or font list, or leave it empty to keep the console's
          own value. Production is always marked in the attention color, so keep it clearly amber.
        </p>
        <div className="flex flex-col gap-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <TokenRows
              mode="tokens"
              values={light}
              effective={KIT.tokens}
              error={error}
              onChange={(token, value) => setLight((current) => ({ ...current, [token]: value }))}
            />
            <TokenRows
              mode="dark"
              values={dark}
              effective={darkBase}
              error={error}
              onChange={(token, value) => setDark((current) => ({ ...current, [token]: value }))}
            />
          </div>
          {error ? <Notice tone="danger">{error.message}</Notice> : null}
          <Button
            className="w-fit"
            onClick={async () => {
              const sure = await ask.confirm({
                title: "Go back to the console's own values?",
                text: "Every value set here is cleared, for light and for dark. Nothing changes until the page is saved.",
                action: "Clear them",
              });
              if (!sure) return;
              setLight({});
              setDark({});
            }}
          >
            Clear back to the console's values
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Preview scheme="light" values={lightValues} />
          <Preview scheme="dark" values={darkValues} />
        </div>
      </Panel>
      <SaveBar
        dirty={dirty}
        saving={busy}
        onSave={() => void save()}
        onDiscard={discard}
        what="the console's branding"
      />
    </div>
  );
}
