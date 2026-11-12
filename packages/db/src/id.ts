import { v7, validate } from "uuid";

/** A new UUIDv7. Every platform identifier is one. */
export function newId(): string {
  return v7();
}

export function isId(value: string): boolean {
  return validate(value);
}
