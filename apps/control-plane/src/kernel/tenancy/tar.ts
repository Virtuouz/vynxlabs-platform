import type { FileHandle } from "node:fs/promises";

/**
 * The tar format, as much of it as a tenant export needs: regular files with
 * names up to 255 characters (the POSIX "ustar" layout). Any tar program can
 * list and unpack the result.
 */
const BLOCK = 512;

function field(header: Buffer, offset: number, length: number, text: string) {
  header.write(text, offset, length, "utf8");
}
const octal = (value: number, length: number) => `${value.toString(8).padStart(length - 1, "0")}\0`;

/** Splits a path into the header's name and prefix fields, at a slash. */
function split(path: string): { name: string; prefix: string } {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: "" };
  for (let at = path.indexOf("/"); at !== -1; at = path.indexOf("/", at + 1)) {
    const prefix = path.slice(0, at);
    const name = path.slice(at + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) return { name, prefix };
  }
  throw new Error(`The path is too long for the archive: ${path}`);
}

/** One file as it is written to the archive: its header, its bytes, and padding to a whole block. */
export function tarEntry(path: string, content: Buffer, modified = new Date(0)): Buffer[] {
  if (content.length >= 8 * 1024 ** 3) throw new Error(`${path} is too large for one entry.`);
  const { name, prefix } = split(path);
  const header = Buffer.alloc(BLOCK);
  field(header, 0, 100, name);
  field(header, 100, 8, octal(0o644, 8));
  field(header, 108, 8, octal(0, 8));
  field(header, 116, 8, octal(0, 8));
  field(header, 124, 12, octal(content.length, 12));
  field(header, 136, 12, octal(Math.floor(modified.getTime() / 1000), 12));
  header.fill(" ", 148, 156);
  field(header, 156, 1, "0");
  field(header, 257, 6, "ustar\0");
  field(header, 263, 2, "00");
  field(header, 345, 155, prefix);
  let sum = 0;
  for (const byte of header) sum += byte;
  field(header, 148, 8, `${sum.toString(8).padStart(6, "0")}\0 `);
  const padding = (BLOCK - (content.length % BLOCK)) % BLOCK;
  return padding > 0 ? [header, content, Buffer.alloc(padding)] : [header, content];
}

/** What ends an archive: two empty blocks. */
export const TAR_END = Buffer.alloc(BLOCK * 2);

export interface TarIndexEntry {
  path: string;
  size: number;
  /** Where the entry's bytes begin in the file. */
  offset: number;
}

const text = (header: Buffer, offset: number, length: number) => {
  const slice = header.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? length : end).toString("utf8");
};

/**
 * Lists the files in an archive on disk without reading their contents.
 * Throws if the archive is cut short or is not one this platform wrote.
 */
export async function tarIndex(file: FileHandle): Promise<TarIndexEntry[]> {
  const { size: total } = await file.stat();
  const entries: TarIndexEntry[] = [];
  const header = Buffer.alloc(BLOCK);
  let position = 0;
  let ended = false;
  while (position + BLOCK <= total) {
    await file.read(header, 0, BLOCK, position);
    if (header.every((byte) => byte === 0)) {
      ended = true;
      break;
    }
    if (text(header, 257, 5) !== "ustar") throw new Error("This is not a tenant export.");
    const stored = Number.parseInt(text(header, 148, 8).trim(), 8);
    const check = Buffer.from(header);
    check.fill(" ", 148, 156);
    let sum = 0;
    for (const byte of check) sum += byte;
    if (sum !== stored) throw new Error("The archive is damaged: a header does not add up.");
    const size = Number.parseInt(text(header, 124, 12).trim(), 8);
    const prefix = text(header, 345, 155);
    const name = text(header, 0, 100);
    if (header[156] !== 0x30 && header[156] !== 0) {
      throw new Error("The archive holds something other than plain files.");
    }
    const offset = position + BLOCK;
    if (offset + size > total) throw new Error("The archive is cut short.");
    entries.push({ path: prefix ? `${prefix}/${name}` : name, size, offset });
    position = offset + Math.ceil(size / BLOCK) * BLOCK;
  }
  if (!ended) throw new Error("The archive is cut short.");
  return entries;
}

/** Reads one entry's bytes. */
export async function tarRead(file: FileHandle, entry: TarIndexEntry): Promise<Buffer> {
  const content = Buffer.alloc(entry.size);
  let done = 0;
  while (done < entry.size) {
    const { bytesRead } = await file.read(content, done, entry.size - done, entry.offset + done);
    if (bytesRead === 0) throw new Error("The archive is cut short.");
    done += bytesRead;
  }
  return content;
}
