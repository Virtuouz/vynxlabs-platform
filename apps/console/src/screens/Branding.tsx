import { Badge, Button, CheckboxField, Notice, TextField } from "@vynxlabs/ui";
import { type CSSProperties, useState } from "react";
import { type ApiError, api, useLoad } from "../api.ts";
import { ask } from "../ask.tsx";
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
 * stylesheet's values cannot be read back per colour scheme. A test holds the
 * two to each other.
 */
export const KIT: Theme = {
  tokens: {
    canvas: "#eef1f4",
    surface: "#ffffff",
    sunken: "#e3e8ed",
    line: "#d3dae2",
    ink: "#16202e",
    "ink-muted": "#5b6777",
    action: "#0e5f7a",
    "action-ink": "#ffffff",
    "action-soft": "#dcedf3",
    attention: "#b45309",
    "attention-soft": "#fdf0dc",
    danger: "#b3261e",
    "danger-soft": "#fbe9e7",
    success: "#1f7a4d",
    "success-soft": "#e1f3e9",
    structure: "#e7ebf0",
    raised: "#ffffff",
    selected: "#e3eff4",
    "line-strong": "#b4bfcb",
    "ink-subtle": "#687485",
    "code-bg": "#f5f7f9",
    focus: "#0e5f7a",
    "radius-control": "6px",
    "radius-panel": "10px",
    font: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    "font-code": 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace',
  },
  dark: {
    canvas: "#10161f",
    surface: "#18212d",
    sunken: "#0c1118",
    line: "#2b3746",
    ink: "#e6ebf1",
    "ink-muted": "#9aa7b6",
    action: "#5cb8d6",
    "action-ink": "#06222c",
    "action-soft": "#17323d",
    attention: "#f0a94b",
    "attention-soft": "#3a2a12",
    danger: "#f2857d",
    "danger-soft": "#3d1b18",
    success: "#6fcf9a",
    "success-soft": "#153326",
    structure: "#0c1118",
    raised: "#1f2a38",
    selected: "#172430",
    "line-strong": "#3a4859",
    "ink-subtle": "#7e8b9b",
    "code-bg": "#0b1016",
    focus: "#5cb8d6",
  },
};

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_LOGO_BYTES = 512 * 1024;

const panel = "flex flex-col gap-3 rounded-panel border border-line bg-surface p-4";
const control =
  "h-9 w-full min-w-0 rounded-control border border-line bg-surface px-2.5 text-ink placeholder:text-ink-muted/70";

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
        const problem = error?.fields.find((field) =>
          field.path.endsWith(`/${mode}/${token}`),
        )?.message;
        const value = values[token] ?? "";
        return (
          <div key={token} className="flex flex-col gap-1">
            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_1.5rem] items-center gap-2">
              <code className="font-mono text-[13px]">{token}</code>
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
              <p role="alert" className="m-0 text-[13px] text-danger">
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
        <code className="font-mono text-[13px] text-ink-muted">orders/record</code>
      </div>
    </div>
  );
}

function ThemeEditor({ base, stored }: { base: string; stored: Theme }) {
  const [light, setLight] = useState<Tokens>(stored.tokens);
  const [dark, setDark] = useState<Tokens>(stored.dark);
  const [error, setError] = useState<ApiError>();
  const [saved, setSaved] = useState<string>();
  const [busy, setBusy] = useState(false);

  const save = async (theme: Theme, done: string) => {
    setBusy(true);
    setError(undefined);
    setSaved(undefined);
    try {
      const now = await api.put<Portal>(`${base}/portal`, { theme });
      setLight(now.theme.tokens);
      setDark(now.theme.dark);
      setSaved(done);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setBusy(false);
    }
  };
  // In dark, a length or font follows light, and a colour is the kit's dark one unless set for dark.
  const lightValues = { ...KIT.tokens, ...set(light) };
  const darkBase = { ...lightValues, ...KIT.dark };
  const darkValues = { ...darkBase, ...set(dark) };

  return (
    <>
      <section className={panel}>
        <h2 className="m-0 text-base font-semibold">Theme</h2>
        <p className="m-0 max-w-[75ch] text-ink-muted">
          The colours, corners and fonts of this tenant's portal, sign-in pages and apps. The
          console keeps its own look. Set a token to a plain colour, length or font list, or leave
          it empty to keep the component kit's value. A workspace can override these with a theme
          resource in its repository.
        </p>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save({ tokens: set(light), dark: set(dark) }, "Saved.");
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
                  title: "Reset to the kit's values?",
                  text: "Every value set here is removed, for light and for dark. The portal and apps go back to the kit's values.",
                  action: "Reset",
                  danger: true,
                });
                if (!sure) return;
                save({ tokens: {}, dark: {} }, "Reset to the kit's values.");
              }}
            >
              Reset to the kit's values
            </Button>
            {saved ? (
              <span role="status" className="text-ink-muted">
                {saved}
              </span>
            ) : null}
          </div>
        </form>
      </section>
      <section className={panel}>
        <h2 className="m-0 text-base font-semibold">Preview</h2>
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
      reload();
    } catch (error) {
      setProblem((error as ApiError).message);
    }
  };

  return (
    <section className={panel}>
      <h2 className="m-0 text-base font-semibold">Logo</h2>
      <p className="m-0 max-w-[75ch] text-ink-muted">
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
            run={() => api.delete(`${base}/portal/logo`)}
            onDone={reload}
          />
        </div>
      ) : (
        <p className="m-0">No logo yet.</p>
      )}
      <label className="flex flex-col gap-1 text-[13px] font-medium">
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
        <span className="font-normal text-ink-muted">PNG, JPEG or WebP, up to 512 KB.</span>
      </label>
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
    </section>
  );
}

export function Branding({ base }: { base: string }) {
  const portal = useLoad<Portal>(`${base}/portal`);
  const [signUp, setSignUp] = useState<boolean>();
  const [problem, setProblem] = useState<string>();

  if (portal.error) {
    return (
      <Page title="Branding">
        <Notice tone="danger" action={<Button onClick={portal.reload}>Try again</Button>}>
          {portal.error.message}
        </Notice>
      </Page>
    );
  }
  if (!portal.data) return null;
  const data = portal.data;

  return (
    <Page
      title="Branding"
      description="How this tenant's portal and apps look to its end users, and whether people may create their own account there."
    >
      <section className={panel}>
        <h2 className="m-0 text-base font-semibold">Portal</h2>
        <p className="m-0 max-w-[75ch]">
          <a
            href={data.portalUrl}
            target="_blank"
            rel="noreferrer"
            className="break-all text-action"
          >
            {data.portalUrl}
          </a>
        </p>
        <p className="m-0 max-w-[75ch] text-ink-muted">
          The portal is where this tenant's end users sign in, choose or reset their password, and
          find the apps that are open to them.{" "}
          {data.mail
            ? "This instance sends mail, so invitations and password reset links are emailed to them."
            : "This instance sends no mail, so invitation and password reset links have to be passed on by hand. They are shown under End users when they are made."}
        </p>
        <CheckboxField
          label="People may create their own account"
          name="signUp"
          checked={signUp ?? data.signUp}
          hint="When this is off, only people invited under End users have an account."
          error={problem}
          onChange={async (checked) => {
            setSignUp(checked);
            setProblem(undefined);
            try {
              await api.put(`${base}/portal`, { signUp: checked });
            } catch (error) {
              setSignUp(!checked);
              setProblem((error as ApiError).message);
            }
          }}
        />
      </section>
      <ThemeEditor base={base} stored={data.theme} />
      <Logo base={base} has={data.logo} reload={portal.reload} />
    </Page>
  );
}
