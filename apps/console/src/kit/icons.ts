/**
 * Icons from a logo, made in the browser: the logo is drawn onto a square
 * canvas at each size the platform keeps, and each is sent as a PNG. The
 * browser already knows how to read a PNG, a JPEG, a WebP and an SVG, so the
 * server needs no image library to make a favicon.
 */

/** The sizes the platform keeps: a tab, an Apple touch icon, and the two a web manifest asks for. */
export const ICON_SIZES = [32, 180, 192, 512] as const;

/** How much of the square the logo fills. A touch icon is cropped to a rounded shape, so it keeps a margin. */
const FILL = 0.84;

function loaded(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const address = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(address);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(address);
      reject(new Error("The image could not be read to make icons from it."));
    };
    image.src = address;
  });
}

/**
 * The logo at each size, as PNGs: whole, centred, and never stretched. A logo
 * that is wider than it is tall is fitted by its width. An SVG with no size of
 * its own is drawn as a square.
 */
export async function iconsFrom(logo: Blob): Promise<{ size: number; png: Blob }[]> {
  const image = await loaded(logo);
  const width = image.naturalWidth || 512;
  const height = image.naturalHeight || 512;
  const icons: { size: number; png: Blob }[] = [];
  for (const size of ICON_SIZES) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot draw the icons.");
    context.imageSmoothingQuality = "high";
    const scale = (size * FILL) / Math.max(width, height);
    const w = width * scale;
    const h = height * scale;
    context.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("This browser cannot make the icons.");
    icons.push({ size, png });
  }
  return icons;
}

/** Makes the icons from a logo and sends each to `path/<size>`. */
export async function sendIcons(
  logo: Blob,
  path: string,
  upload: (path: string, body: Blob, method: "PUT") => Promise<unknown>,
): Promise<void> {
  for (const icon of await iconsFrom(logo)) {
    await upload(`${path}/${icon.size}`, icon.png, "PUT");
  }
}
