import { crc32, inflateSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { defaultIcon, ICON_SIZES, icoOf, pngSize, webManifest } from "./icons.js";

/** A PNG's chunks, each checked against its own checksum as a reader would. */
function chunks(png: Buffer): { name: string; data: Buffer }[] {
  const found: { name: string; data: Buffer }[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    const body = png.subarray(at + 4, at + 8 + length);
    expect(png.readUInt32BE(at + 8 + length)).toBe(crc32(body));
    found.push({ name: body.subarray(0, 4).toString("latin1"), data: body.subarray(4) });
    at += 12 + length;
  }
  return found;
}

describe("icons", () => {
  test("the default icon is a PNG a reader accepts, at each size kept", () => {
    for (const size of ICON_SIZES) {
      const png = defaultIcon(size);
      expect(pngSize(png)).toEqual({ width: size, height: size });
      const parts = chunks(png);
      expect(parts.map((part) => part.name)).toEqual(["IHDR", "IDAT", "IEND"]);
      // Eight bits for each of red, green, blue and alpha, and a row of them for each line.
      expect([...(parts[0]?.data.subarray(8, 13) ?? [])]).toEqual([8, 6, 0, 0, 0]);
      const pixels = inflateSync(parts[1]?.data as Buffer);
      expect(pixels.length).toBe(size * (size * 4 + 1));
      // Its corners are clear and its middle is not: a rounded square.
      expect(pixels[4]).toBe(0);
      const middle = Math.floor(size / 2) * (size * 4 + 1) + 1 + Math.floor(size / 2) * 4;
      expect(pixels[middle + 3]).toBe(255);
    }
    // Drawn once, and kept.
    expect(defaultIcon(32)).toBe(defaultIcon(32));
  });

  test("what is not a PNG has no size", () => {
    expect(pngSize(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeUndefined();
    expect(pngSize(Buffer.alloc(0))).toBeUndefined();
    expect(pngSize(Buffer.from(`GIF89a${"x".repeat(40)}`))).toBeUndefined();
  });

  test("an .ico is a header, one entry that says where the image is, and the PNG", () => {
    const png = defaultIcon(32);
    const ico = icoOf(png, 32);
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 1]);
    expect([ico.readUInt8(6), ico.readUInt8(7)]).toEqual([32, 32]);
    expect(ico.readUInt32LE(14)).toBe(png.length);
    expect(ico.subarray(ico.readUInt32LE(18)).equals(png)).toBe(true);
  });

  test("a manifest names the two large icons", () => {
    expect(webManifest("Northwind Operations", "/api/v1/instance/branding/icons", "/")).toEqual({
      name: "Northwind Operations",
      short_name: "Northwind Op",
      start_url: "/",
      display: "browser",
      icons: [
        { src: "/api/v1/instance/branding/icons/192", sizes: "192x192", type: "image/png" },
        { src: "/api/v1/instance/branding/icons/512", sizes: "512x512", type: "image/png" },
      ],
    });
  });
});
