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

function generate(source, files) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "reader-icons-"));
  try {
    execFileSync(process.execPath, [cli, "icon", path.join(assets, source), "--output", scratch],
      { cwd: path.join(root, "reader"), stdio: "pipe" });
    for (const [generated, target] of files) {
      fs.copyFileSync(path.join(scratch, generated), path.join(output, target));
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
generate("journal-bookmark-fill.svg", applicationFiles.map((file) => [file, file]));
generate("filetype-pdf.svg", [["icon.ico", "file-pdf.ico"]]);
generate("filetype-md.svg", [["icon.ico", "file-markdown.ico"]]);
console.log("Generated application and file association icons from the canonical SVG sources.");
