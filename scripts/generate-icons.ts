import path from "node:path";
import sharp from "sharp";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const SOURCE_SVG = path.join(PUBLIC_DIR, "icon.svg");

const ICON_TARGETS = [
  { filename: "apple-touch-icon.png", size: 180 },
  { filename: "icon-192.png", size: 192 },
  { filename: "icon-512.png", size: 512 },
] as const;

async function generateIcons(): Promise<void> {
  for (const target of ICON_TARGETS) {
    const outputPath = path.join(PUBLIC_DIR, target.filename);
    await sharp(SOURCE_SVG, { density: 384 })
      .resize(target.size, target.size, {
        fit: "contain",
        background: { r: 15, g: 92, b: 77, alpha: 1 },
      })
      .flatten({ background: { r: 15, g: 92, b: 77 } })
      .png({ compressionLevel: 9 })
      .toFile(outputPath);

    console.log(`Generated ${target.filename} (${target.size}x${target.size})`);
  }
}

generateIcons().catch((error: unknown) => {
  console.error("Failed to generate PWA icons:", error);
  process.exit(1);
});
