import { crc32, deflateSync } from "node:zlib";

/**
 * Icons made from a logo: what a browser's tab, a phone's home screen and an
 * installed app show. They are made where the logo is chosen, by the browser
 * drawing it at each size, and kept here as they arrive. The server has no
 * image library and needs none: it checks that what arrived is a PNG of the
 * size it says, wraps one as an `.ico`, and draws the default itself.
 */

/** The sizes kept, in pixels: a tab, an Apple touch icon, and the two a web manifest asks for. */
export const ICON_SIZES = [32, 180, 192, 512] as const;
export type IconSize = (typeof ICON_SIZES)[number];
export const isIconSize = (size: number): size is IconSize =>
  (ICON_SIZES as readonly number[]).includes(size);

/** The most one icon may weigh. A 512 px PNG of a logo is far under this. */
export const MAX_ICON_BYTES = 256 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The width and height a PNG says it has, or nothing when the bytes are not a PNG. */
export function pngSize(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return undefined;
  // The first chunk is always IHDR: its length, its name, then width and height.
  if (bytes.subarray(12, 16).toString("latin1") !== "IHDR") return undefined;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * A PNG as an `.ico`: a six-byte header, one sixteen-byte entry, and the PNG
 * itself. Every browser that asks for `/favicon.ico` reads a PNG inside one.
 */
export function icoOf(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // an icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(size >= 256 ? 0 : size, 6);
  header.writeUInt8(size >= 256 ? 0 : size, 7);
  header.writeUInt8(0, 8); // no palette
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10); // color planes
  header.writeUInt16LE(32, 12); // bits for each pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18); // where the image begins
  return Buffer.concat([header, png]);
}

function chunk(name: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(name, "latin1"), data]);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, check]);
}

const drawn = new Map<number, Buffer>();

/**
 * The icon an instance has before anyone gives it a logo: a rounded square in
 * the platform's own color with a lighter corner, drawn here pixel by pixel.
 */
export function defaultIcon(size: number): Buffer {
  const made = drawn.get(size);
  if (made) return made;
  const radius = size * 0.22;
  const row = size * 4 + 1;
  const pixels = Buffer.alloc(row * size);
  /** How much of a pixel is inside the rounded square, from 0 to 1, for a soft edge. */
  const inside = (x: number, y: number) => {
    const dx = Math.max(radius - x - 0.5, x + 0.5 - (size - radius), 0);
    const dy = Math.max(radius - y - 0.5, y + 0.5 - (size - radius), 0);
    return Math.min(1, Math.max(0, radius - Math.hypot(dx, dy) + 0.5));
  };
  for (let y = 0; y < size; y += 1) {
    pixels[y * row] = 0; // no filter on this row
    for (let x = 0; x < size; x += 1) {
      // The corner that is folded: lighter, above the line from the top's middle to the right's.
      const folded = x - y > size * 0.45;
      const at = y * row + 1 + x * 4;
      pixels[at] = folded ? 0x5b : 0x0e;
      pixels[at + 1] = folded ? 0xb5 : 0x5a;
      pixels[at + 2] = folded ? 0xd6 : 0x73;
      pixels[at + 3] = Math.round(inside(x, y) * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.writeUInt8(8, 8); // bits for each channel
  header.writeUInt8(6, 9); // red, green, blue and alpha
  const png = Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  drawn.set(size, png);
  return png;
}

/** What a web manifest says of an instance or a tenant's portal: its name and its two large icons. */
export function webManifest(name: string, iconBase: string, start: string): object {
  return {
    name,
    short_name: name.slice(0, 12),
    start_url: start,
    display: "browser",
    icons: [192, 512].map((size) => ({
      src: `${iconBase}/${size}`,
      sizes: `${size}x${size}`,
      type: "image/png",
    })),
  };
}
