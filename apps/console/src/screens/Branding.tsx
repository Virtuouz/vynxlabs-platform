import {
  Badge,
  Button,
  CheckboxField,
  CONTRAST_NEEDED,
  contrastRatio,
  Notice,
  TextField,
} from "@volvel/ui";
import { type CSSProperties, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask, notify } from "../ask.tsx";
import { sendIcons } from "../kit/icons.ts";
import { ErrorState, Loading } from "../kit/LoadState.tsx";
import { SaveBar } from "../kit/SaveBar.tsx";
import { Page, RemoveButton } from "../ListScreen.tsx";
import { size } from "./Apps.tsx";

type Tokens = Record<string, string>;
interface Theme {
  tokens: Tokens;
  dark: Tokens;
}
interface Portal {
  signUp: boolean;
  theme: Theme;
  logo: boolean;
  mail: boolean;
  portalUrl: string;
}

/** Every token a theme can set. Each is the CSS variable `--vx-<name>`. */
export const THEME_TOKENS = [
  "canvas",
  "surface",
  "sunken",
  "line",
  "ink",
  "ink-muted",
  "action",
  "action-ink",
  "action-soft",
  "attention",
  "attention-soft",
  "danger",
  "danger-soft",
  "success",
  "success-soft",
  "structure",
  "raised",
  "selected",
  "line-strong",
  "line-control",
  "ink-subtle",
  "code-bg",
  "focus",
  "radius-control",
  "radius-panel",
  "font",
  "font-code",
];
const isColour = (token: string) => !token.startsWith("radius-") && !token.startsWith("font");

/**
 * The component kit's own values. They are written here as well as in the kit's
 * stylesheet because the editor shows them where nothing is set, and a
 * stylesheet's values cannot be read back per color scheme. A test holds the
 * two to each other.
 */
export const KIT: Theme = {
  tokens: {
    canvas: "#f3f5f8",
    surface: "#ffffff",
    sunken: "#eef1f5",
    line: "#dde3ea",
    ink: "#0f1720",
    "ink-muted": "#4b5666",
    action: "#0b6b88",
    "action-ink": "#ffffff",
    "action-soft": "#dcf0f7",
    attention: "#9a4707",
    "attention-soft": "#fdf0dc",
    danger: "#b3261e",
    "danger-soft": "#fbe9e7",
    success: "#1b6e45",
    "success-soft": "#e1f3e9",
    structure: "#eaeef3",
    raised: "#ffffff",
    selected: "#e0f0f6",
    "line-strong": "#c6cfd9",
    "line-control": "#748090",
    "ink-subtle": "#586474",
    "code-bg": "#f5f7f9",
    focus: "#0b6b88",
    "radius-control": "8px",
    "radius-panel": "12px",
    font: '"Geist", ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    "font-code":
      '"Geist Mono", ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace',
  },
  dark: {
    canvas: "#0e1218",
    surface: "#11161d",
    sunken: "#0f141a",
    line: "#1f2731",
    ink: "#e7eaee",
    "ink-muted": "#9aa5b4",
    action: "#5cc2e6",
    "action-ink": "#071016",
    "action-soft": "#14252e",
    attention: "#f0a541",
    "attention-soft": "#2a2318",
    danger: "#ff8a8d",
    "danger-soft": "#2e1a1e",
    success: "#4fd1a5",
    "success-soft": "#16292a",
    structure: "#0b0f14",
    raised: "#192029",
    selected: "#13212a",
    "line-strong": "#2a3542",
    "line-control": "#5e6d81",
    "ink-subtle": "#8290a1",
    "code-bg": "#0b0f14",
    focus: "#5cc2e6",
  },
};

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_LOGO_BYTES = 512 * 1024;

const panel = "flex flex-col gap-3 rounded-panel border border-line bg-surface p-4";
const control =
  "h-control w-full min-w-0 rounded-control border border-line bg-surface px-3 text-ink placeholder:text-ink-muted/70";

/** The values that are set: what is sent, and what the preview lays over the kit's. */
export const set = (values: Tokens): Tokens =>
  Object.fromEntries(
    Object.entries(values)
      .map(([token, value]) => [token, value.trim()])
      .filter(([, value]) => value !== ""),
  );

const variables = (values: Tokens, scheme: "light" | "dark") => ({
  ...Object.fromEntries(Object.entries(values).map(([token, value]) => [`--vx-${token}`, value])),
  "color-scheme": scheme,
});

export function TokenRows({
  mode,
  values,
  effective,
  error,
  onChange,
}: {
  mode: "tokens" | "dark";
  values: Tokens;
  /** What each token comes to with nothing typed here. */
  effective: Tokens;
  error: ApiError | undefined;
  onChange: (token: string, value: string) => void;
}) {
  const scheme = mode === "tokens" ? "light" : "dark";
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 font-medium">{mode === "tokens" ? "Light" : "Dark"}</legend>
      {THEME_TOKENS.map((token) => {
        const problem = error?.fields?.find((field) =>
          field.path.endsWith(`/${mode}/${token}`),
        )?.message;
        const value = values[token] ?? "";
        return (
          <div key={token} className="flex flex-col gap-1">
            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_1.5rem] items-center gap-2">
              <code className="font-mono text-code">{token}</code>
              <input
                type="text"
                name={`${mode}-${token}`}
                aria-label={`${token}, ${scheme}`}
                aria-invalid={problem !== undefined}
                className={control}
                value={value}
                // A length or font not set for dark stays as it is in light.
                placeholder={mode === "dark" && !isColour(token) ? "same as light" : "kit default"}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => onChange(token, event.currentTarget.value)}
              />
              {isColour(token) ? (
                <span
                  aria-hidden="true"
                  data-swatch={`${mode}-${token}`}
                  className="size-6 rounded-control border border-line"
                  style={{ background: value.trim() || effective[token] }}
                />
              ) : (
                <span />
              )}
            </div>
            {problem ? (
              <p role="alert" className="m-0 text-body-sm text-danger">
                {token} {problem}
              </p>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}

/** A few kit components under the values in the editor, so a change can be judged before it is saved. */
export function Preview({ scheme, values }: { scheme: "light" | "dark"; values: Tokens }) {
  return (
    <div
      data-preview={scheme}
      className="flex min-w-0 flex-col gap-3 rounded-panel border border-line bg-canvas p-4 font-sans text-ink"
      style={variables(values, scheme) as CSSProperties}
    >
      <p className="m-0 flex flex-wrap items-center gap-2 font-medium">
        {/* badge-allowed: a preview of the tenant kit's own Badge, as tenant apps draw it */}
        {scheme === "light" ? "Light" : "Dark"} <Badge tone="action">Active</Badge>
        <Badge tone="success">Paid</Badge>
      </p>
      <div className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-3">
        <TextField
          label="Email"
          name={`preview-${scheme}-email`}
          placeholder="you@example.com"
          hint="A hint under a field."
          required={false}
        />
        <Notice tone="attention">A notice that needs to be seen.</Notice>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary">Save</Button>
          <Button>Cancel</Button>
        </div>
        <code className="font-mono text-code text-ink-muted">orders/record</code>
      </div>
      <ContrastCheck values={values} />
    </div>
  );
}

/** Pairs of tokens drawn on each other, and the contrast each needs. */
const PAIRS: [ink: string, ground: string, needs: "text" | "edge"][] = [
  ...["ink", "ink-muted", "ink-subtle"].flatMap((ink) =>
    ["canvas", "surface", "sunken", "structure"].map(
      (ground) => [ink, ground, "text"] as [string, string, "text"],
    ),
  ),
  ["action", "surface", "text"],
  ["action", "canvas", "text"],
  ["action-ink", "action", "text"],
  ["attention", "surface", "text"],
  ["attention", "attention-soft", "text"],
  ["success", "surface", "text"],
  ["success", "success-soft", "text"],
  ["danger", "surface", "text"],
  ["danger", "danger-soft", "text"],
  ["line-control", "surface", "edge"],
  ["line-control", "canvas", "edge"],
];

/**
 * Says which colors in a scheme would be hard to read, with each pair's
 * contrast and what it needs. It warns; saving is still allowed.
 */
export function ContrastCheck({ values }: { values: Tokens }) {
  const failing = PAIRS.flatMap(([ink, ground, needs]) => {
    const one = values[ink];
    const two = values[ground];
    if (!one || !two) return [];
    const ratio = contrastRatio(one, two);
    return ratio !== undefined && ratio < CONTRAST_NEEDED[needs]
      ? [{ ink, ground, ratio, needs: CONTRAST_NEEDED[needs] }]
      : [];
  });
  if (failing.length === 0) {
    return <p className="m-0 text-meta text-ink-muted">Every pair checked is easy to read.</p>;
  }
  return (
    <Notice tone="attention">
      <p className="m-0 font-medium">
        {failing.length === 1 ? "One pair is" : `${failing.length} pairs are`} hard to read:
      </p>
      <ul className="m-0 mt-1 pl-4">
        {failing.map((one) => (
          <li key={`${one.ink}-${one.ground}`}>
            <code className="font-mono">{one.ink}</code> on{" "}
            <code className="font-mono">{one.ground}</code>: {one.ratio.toFixed(2)}, needs{" "}
            {one.needs}
          </li>
        ))}
      </ul>
    </Notice>
  );
}

/** The theme's fields, and a preview of them. What they hold is saved with the page. */
function ThemeEditor({
  light,
  dark,
  setLight,
  setDark,
  error,
}: {
  light: Tokens;
  dark: Tokens;
  setLight: (change: (current: Tokens) => Tokens) => void;
  setDark: (change: (current: Tokens) => Tokens) => void;
  error: ApiError | undefined;
}) {
  // In dark, a length or font follows light, and a color is the kit's dark one unless set for dark.
  const lightValues = { ...KIT.tokens, ...set(light) };
  const darkBase = { ...lightValues, ...KIT.dark };
  const darkValues = { ...darkBase, ...set(dark) };

  return (
    <>
      <section className={panel}>
        <h2 className="m-0 text-title font-semibold">Theme</h2>
        <p className="m-0 max-w-measure text-ink-muted">
          The colors, corners and fonts of this tenant's portal, sign-in pages and apps. The console
          keeps its own look. Set a token to a plain color, length or font list, or leave it empty
          to keep the component kit's value. A workspace can override these with a theme resource in
          its repository.
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
                title: "Go back to the kit's values?",
                text: "Every value set here is cleared, for light and for dark. Nothing changes until the page is saved.",
                action: "Clear them",
              });
              if (!sure) return;
              setLight(() => ({}));
              setDark(() => ({}));
            }}
          >
            Clear back to the kit's values
          </Button>
        </div>
      </section>
      <section className={panel}>
        <h2 className="m-0 text-title font-semibold">Preview</h2>
        <p className="m-0 text-ink-muted">
          Kit components under the values in the fields above, saved or not.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Preview scheme="light" values={lightValues} />
          <Preview scheme="dark" values={darkValues} />
        </div>
      </section>
    </>
  );
}

function Logo({ base, has, reload }: { base: string; has: boolean; reload: () => void }) {
  const [problem, setProblem] = useState<string>();
  // Changes with each upload, so that the browser shows the new image and not the one it kept.
  const [version, setVersion] = useState(0);

  const upload = async (file: File) => {
    setProblem(undefined);
    if (!LOGO_TYPES.includes(file.type)) {
      setProblem("Choose a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setProblem(`That image is ${size(file.size)}. A logo can be 512 KB at most.`);
      return;
    }
    try {
      await api.upload(`${base}/portal/logo`, file, "PUT");
      setVersion((current) => current + 1);
      notify.success("The logo is replaced.");
      // The icons its sign-in pages and apps show in a tab are drawn from it here, once the
      // logo itself is in place.
      void sendIcons(file, `${base}/portal/icons`, (path, body) =>
        api.upload(path, new File([body], "icon.png", { type: "image/png" }), "PUT"),
      ).catch(() => notify.info("The tenant's icons could not be made from the logo."));
      reload();
    } catch (error) {
      setProblem((error as ApiError).message);
    }
  };

  return (
    <section className={panel}>
      <h2 className="m-0 text-title font-semibold">Logo</h2>
      <p className="m-0 max-w-measure text-ink-muted">
        Shown on the sign-in pages, and there for apps to use.
      </p>
      {has ? (
        <div className="flex flex-wrap items-center gap-4">
          <img
            src={`/api/v1${base}/portal/logo?v=${version}`}
            alt="The tenant's logo"
            className="max-h-16 max-w-48 rounded-control border border-line bg-canvas p-2"
          />
          <RemoveButton
            label="Remove logo"
            confirm="Remove the logo? The sign-in pages show the tenant's name alone."
            run={async () => {
              await api.delete(`${base}/portal/logo`);
              await api.delete(`${base}/portal/icons`);
            }}
            onDone={reload}
          />
        </div>
      ) : (
        <p className="m-0">No logo yet.</p>
      )}
      <label className="flex flex-col gap-1 text-body-sm font-medium">
        {has ? "Replace the logo" : "Upload a logo"}
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
          PNG, JPEG or WebP, up to 512 KB. Choosing one replaces the logo at once.
        </span>
      </label>
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
    </section>
  );
}

export function Branding({ base }: { base: string }) {
  const portal = useLoad<Portal>(`${base}/portal`);
  if (portal.error) {
    return (
      <Page title="Branding">
        <ErrorState error={portal.error} onRetry={portal.reload} />
      </Page>
    );
  }
  if (!portal.data) return <Loading />;
  return <BrandingForm base={base} data={portal.data} reload={portal.reload} />;
}

/** The page's settings, changed together and saved with the bar at its foot. */
function BrandingForm({ base, data, reload }: { base: string; data: Portal; reload: () => void }) {
  const [signUp, setSignUp] = useState(data.signUp);
  const [light, setLight] = useState<Tokens>(data.theme.tokens);
  const [dark, setDark] = useState<Tokens>(data.theme.dark);
  const [error, setError] = useState<ApiError>();
  const [saving, setSaving] = useState(false);
  const same = (one: Tokens, two: Tokens) => JSON.stringify(set(one)) === JSON.stringify(set(two));
  const dirty =
    signUp !== data.signUp || !same(light, data.theme.tokens) || !same(dark, data.theme.dark);
  const discard = () => {
    setSignUp(data.signUp);
    setLight(data.theme.tokens);
    setDark(data.theme.dark);
    setError(undefined);
  };
  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const now = await api.put<Portal>(`${base}/portal`, {
        signUp,
        theme: { tokens: set(light), dark: set(dark) },
      });
      setLight(now.theme.tokens);
      setDark(now.theme.dark);
      notify.success("Branding saved. The portal and apps show it from their next page.");
      reload();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page
      title="Branding"
      description="How this tenant's portal and apps look to its end users, and whether people may create their own account there. Changes are saved together, from the bar that appears below."
    >
      <section className={panel}>
        <h2 className="m-0 text-title font-semibold">Portal</h2>
        <p className="m-0 max-w-measure">
          <a
            href={data.portalUrl}
            target="_blank"
            rel="noreferrer"
            className="break-all text-action"
          >
            {data.portalUrl}
          </a>
        </p>
        <p className="m-0 max-w-measure text-ink-muted">
          The portal is where this tenant's end users sign in, choose or reset their password, and
          find the apps that are open to them.{" "}
          {data.mail
            ? "This instance sends mail, so invitations and password reset links are emailed to them."
            : "This instance sends no mail, so invitation and password reset links have to be passed on by hand. They are shown under End users when they are made."}
        </p>
        <CheckboxField
          label="People may create their own account"
          name="signUp"
          checked={signUp}
          hint="When this is off, only people invited under End users have an account."
          onChange={setSignUp}
        />
      </section>
      <ThemeEditor light={light} dark={dark} setLight={setLight} setDark={setDark} error={error} />
      <Logo base={base} has={data.logo} reload={reload} />
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void save()}
        onDiscard={discard}
        what="this tenant's branding"
      />
    </Page>
  );
}
