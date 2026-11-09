import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "reader/src/assets/icons");
const output = path.join(root, "reader/src-tauri/icons");
const cli = path.join(root, "reader/node_modules/@tauri-apps/cli/tauri.js");
const applicationFiles = [
  "32x32.png", "128x128.png", "128x128@2x.png", "icon.png", "icon.ico", "icon.icns",
  "Square30x30Logo.png", "Square44x44Logo.png", "Square71x71Logo.png",
  "Square89x89Logo.png", "Square107x107Logo.png", "Square142x142Logo.png",
  "Square150x150Logo.png", "Square284x284Logo.png", "Square310x310Logo.png", "StoreLogo.png",
];

function readIco(data) {
  const count = data.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const entry = data.subarray(6 + index * 16, 22 + index * 16);
    const size = entry.readUInt32LE(8), offset = entry.readUInt32LE(12);
    return { width: entry[0] || 256, entry: Buffer.from(entry), image: data.subarray(offset, offset + size) };
  });
}

function writeIco(frames) {
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach((frame, index) => {
    frame.entry.copy(header, 6 + index * 16);
    header.writeUInt32LE(frame.image.length, 6 + index * 16 + 8);
    header.writeUInt32LE(offset, 6 + index * 16 + 12);
    offset += frame.image.length;
  });
  return Buffer.concat([header, ...frames.map((frame) => frame.image)]);
}

function generate(source, files) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "reader-icons-"));
  try {
    const input = path.join(assets, source);
    execFileSync(process.execPath, [cli, "icon", input, "--output", scratch],
      { cwd: path.join(root, "reader"), stdio: "pipe" });
    for (const [generated, target] of files) {
      const data = fs.readFileSync(path.join(scratch, generated));
      if (target === "icon.ico") {
        // Tauri decodes the first ICO entry for the live Windows window icon.
        // Keep all size variants but put the 256px source first for high DPI.
        const count = data.readUInt16LE(4);
        const entries = Array.from({ length: count }, (_, index) => Buffer.from(data.subarray(6 + index * 16, 22 + index * 16)));
        entries.sort((left, right) => (right[0] || 256) - (left[0] || 256));
        entries.forEach((entry, index) => entry.copy(data, 6 + index * 16));
      }
      fs.writeFileSync(path.join(output, target), data);
    }
  } finally {
    // Only delete the exact temporary directory allocated by mkdtemp above.
    const resolved = path.resolve(scratch);
    const tempRoot = path.resolve(os.tmpdir());
    if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith("reader-icons-")) {
      throw new Error("Unexpected icon generation temporary path");
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

fs.mkdirSync(output, { recursive: true });
generate("shell-reader.svg", applicationFiles.map((file) => [file, file]));
// File icons: 16/24px frames come from a simplified, pixel-aligned small master,
// because the full page with letters turns to mush at Explorer's small-icon size.
for (const type of ["pdf", "markdown"]) {
  const target = `file-${type}.ico`;
  generate(`shell-${type}-small.svg`, [["icon.ico", target]]);
  const small = readIco(fs.readFileSync(path.join(output, target)));
  generate(`shell-${type}.svg`, [["icon.ico", target]]);
  const large = readIco(fs.readFileSync(path.join(output, target)));
  const frames = [...small.filter((frame) => frame.width <= 24), ...large.filter((frame) => frame.width > 24)];
  fs.writeFileSync(path.join(output, target), writeIco(frames));
}
console.log("Generated native application and file association icons from the shell SVG sources.");
