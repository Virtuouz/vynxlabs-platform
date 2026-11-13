import type { ManifestIssue } from "./registry.js";

/**
 * A form that starts a script or a flow: a page with a few fields, served by
 * the platform with no code of the tenant's. What is sent becomes the input,
 * one value per field, by the field's name.
 */
export interface FormTrigger {
  title: string;
  description?: string;
  fields: FormField[];
  /** What the button says. Default "Send". */
  submitLabel?: string;
  /** What is shown once the form was sent. */
  success?: string;
  /** Who may send it. `signed_in` asks for a sign-in to the tenant's portal first. Default `anyone`. */
  access?: "anyone" | "signed_in";
}

export const FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "number",
  "date",
  "select",
  "checkbox",
] as const;

export interface FormField {
  /** The key the value has in the input. */
  name: string;
  label: string;
  type: (typeof FORM_FIELD_TYPES)[number];
  required?: boolean;
  help?: string;
  /** What a `select` offers. */
  options?: string[];
}

/** The most text a field takes. */
export const FORM_TEXT_LIMIT = { text: 500, email: 320, textarea: 5000 } as const;

/** A name the platform's own hidden fields use. No field of a form may take one. */
export const FORM_RESERVED_NAMES: readonly string[] = ["website", "key", "return"];

/** What is wrong with a form, beyond what its JSON Schema can say. `at` is where the form is written. */
export function checkForm(form: FormTrigger, at: string): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const seen = new Set<string>();
  form.fields.forEach((field, index) => {
    const where = `${at}/fields/${index}`;
    if (seen.has(field.name)) {
      issues.push({ path: `${where}/name`, message: `two fields are named "${field.name}"` });
    }
    seen.add(field.name);
    if (FORM_RESERVED_NAMES.includes(field.name)) {
      issues.push({
        path: `${where}/name`,
        message: `"${field.name}" is kept for the form itself. Choose another name`,
      });
    }
    if (field.type === "select" && (field.options ?? []).length === 0) {
      issues.push({ path: `${where}/options`, message: "a select needs options to choose from" });
    }
    if (field.type !== "select" && field.options !== undefined) {
      issues.push({ path: `${where}/options`, message: "only a select has options" });
    }
  });
  return issues;
}

/**
 * Reads what was sent to a form. Gives the input when every field holds, and
 * otherwise what is wrong with each field, by its name.
 */
export function readFormAnswer(
  form: FormTrigger,
  sent: Record<string, string | undefined>,
): { input: Record<string, unknown>; problems: Record<string, string> } {
  const input: Record<string, unknown> = {};
  const problems: Record<string, string> = {};
  for (const field of form.fields) {
    const raw = (sent[field.name] ?? "").trim();
    if (field.type === "checkbox") {
      const ticked = raw !== "";
      if (field.required && !ticked) problems[field.name] = "Tick this to go on.";
      input[field.name] = ticked;
      continue;
    }
    if (raw === "") {
      if (field.required) problems[field.name] = "This is needed.";
      continue;
    }
    switch (field.type) {
      case "number": {
        const value = Number(raw);
        if (!Number.isFinite(value)) problems[field.name] = "Give a number.";
        else input[field.name] = value;
        break;
      }
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
          problems[field.name] = "Give a date.";
        } else input[field.name] = raw;
        break;
      case "select":
        if (!(field.options ?? []).includes(raw))
          problems[field.name] = "Choose one of the options.";
        else input[field.name] = raw;
        break;
      case "email":
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) || raw.length > FORM_TEXT_LIMIT.email) {
          problems[field.name] = "Give an email address.";
        } else input[field.name] = raw;
        break;
      default:
        if (raw.length > FORM_TEXT_LIMIT[field.type]) {
          problems[field.name] = `Keep this under ${FORM_TEXT_LIMIT[field.type]} characters.`;
        } else input[field.name] = raw;
    }
  }
  return { input, problems };
}
