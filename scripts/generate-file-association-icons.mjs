import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const outputDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../reader/src-tauri/icons",
);
const sizes = [16, 32, 48, 256];

const glyphs = {
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
};

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBytes, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), 8 + data.length);
  return chunk;
}

function rgbaPng(width, height, pixels) {
  const rowSize = width * 4 + 1;
  const scanlines = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowSize;
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function setPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (y * size + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function fillRect(pixels, size, x, y, width, height, color) {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(size, Math.ceil(x + width));
  const bottom = Math.min(size, Math.ceil(y + height));
  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) setPixel(pixels, size, px, py, color);
  }
}

function fillRoundRect(pixels, size, x, y, width, height, radius, color) {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.ceil(x + width);
  const bottom = Math.ceil(y + height);
  const r = Math.max(0, radius);
  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      const cx = Math.max(x + r, Math.min(px + 0.5, x + width - r));
      const cy = Math.max(y + r, Math.min(py + 0.5, y + height - r));
      const dx = px + 0.5 - cx;
      const dy = py + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) setPixel(pixels, size, px, py, color);
    }
  }
}

function fillPolygon(pixels, size, points, color) {
  const minX = Math.floor(Math.min(...points.map(([x]) => x)));
  const maxX = Math.ceil(Math.max(...points.map(([x]) => x)));
  const minY = Math.floor(Math.min(...points.map(([, y]) => y)));
  const maxY = Math.ceil(Math.max(...points.map(([, y]) => y)));
  for (let py = minY; py < maxY; py += 1) {
    for (let px = minX; px < maxX; px += 1) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        const crosses = yi > py !== yj > py;
        const atX = ((xj - xi) * (py - yi)) / (yj - yi || 1) + xi;
        if (crosses && px < atX) inside = !inside;
      }
      if (inside) setPixel(pixels, size, px, py, color);
    }
  }
}

function drawGlyph(pixels, size, text, x, y, scale, color) {
  let cursor = x;
  for (const letter of text) {
    const glyph = glyphs[letter];
    if (!glyph) continue;
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] === "1") {
          fillRect(pixels, size, cursor + column * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    cursor += 6 * scale;
  }
}

function renderDocumentIcon(size, kind) {
  const pixels = Buffer.alloc(size * size * 4);
  const palette =
    kind === "pdf"
      ? {
          edge: [169, 43, 50, 255],
          paper: [255, 248, 247, 255],
          fold: [239, 190, 190, 255],
          band: [193, 54, 61, 255],
        }
      : {
          edge: [36, 91, 166, 255],
          paper: [246, 250, 255, 255],
          fold: [183, 211, 244, 255],
          band: [49, 113, 196, 255],
        };
  const x = size * 0.16;
  const y = size * 0.08;
  const width = size * 0.68;
  const height = size * 0.84;
  const radius = size * 0.085;
  const stroke = Math.max(1, Math.round(size * 0.045));

  fillRoundRect(pixels, size, x, y, width, height, radius, palette.edge);
  fillRoundRect(
    pixels,
    size,
    x + stroke,
    y + stroke,
    width - stroke * 2,
    height - stroke * 2,
    Math.max(1, radius - stroke),
    palette.paper,
  );

  const foldX = x + width * 0.57;
  const foldY = y + stroke;
  fillPolygon(
    pixels,
    size,
    [
      [foldX, foldY],
      [x + width - stroke, foldY],
      [x + width - stroke, y + height * 0.25],
      [foldX, y + height * 0.25],
    ],
    palette.fold,
  );

  const bandY = y + height * 0.66;
  fillRect(pixels, size, x + stroke, bandY, width - stroke * 2, height * 0.22, palette.band);

  if (size >= 24) {
    const text = kind === "pdf" ? "PDF" : "MD";
    const scale = Math.max(1, Math.floor((size * 0.2 - 2) / 7));
    const textWidth = (text.length * 6 - 1) * scale;
    const textHeight = 7 * scale;
    drawGlyph(
      pixels,
      size,
      text,
      x + (width - textWidth) / 2,
      bandY + (height * 0.22 - textHeight) / 2,
      scale,
      [255, 255, 255, 255],
    );
  } else {
    fillRect(pixels, size, x + size * 0.28, bandY, size * 0.12, size * 0.16, [255, 255, 255, 255]);
  }

  return rgbaPng(size, size, pixels);
}

function makeIco(kind) {
  const frames = sizes.map((size) => ({ size, png: renderDocumentIcon(size, kind) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  const entries = Buffer.alloc(frames.length * 16);
  let offset = header.length + entries.length;
  for (let i = 0; i < frames.length; i += 1) {
    const { size, png } = frames[i];
    const entry = i * 16;
    entries[entry] = size === 256 ? 0 : size;
    entries[entry + 1] = size === 256 ? 0 : size;
    entries[entry + 2] = 0;
    entries[entry + 3] = 0;
    entries.writeUInt16LE(1, entry + 4);
    entries.writeUInt16LE(32, entry + 6);
    entries.writeUInt32LE(png.length, entry + 8);
    entries.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  }
  return Buffer.concat([header, entries, ...frames.map(({ png }) => png)]);
}

fs.mkdirSync(outputDir, { recursive: true });
for (const kind of ["pdf", "markdown"]) {
  const filePath = path.join(outputDir, `file-${kind}.ico`);
  fs.writeFileSync(filePath, makeIco(kind));
  console.log(`Generated ${filePath}`);
}
