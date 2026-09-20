/**
 * Generates public/icons/icon-{192,512}.png for the PWA manifest.
 * Zero image dependencies: raw RGBA pixels are hand-rolled into PNG
 * chunks (IHDR/IDAT/IEND) with node:zlib deflate.
 *
 * Run: bun scripts/gen-icons.ts
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  new DataView(out.buffer).setUint32(0, data.length);
  const typeBytes = new TextEncoder().encode(type);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(typeBytes);
  crcInput.set(data, 4);
  new DataView(out.buffer).setUint32(8 + data.length, crc32(crcInput));
  return out;
}

function pngFromRgba(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = 1 + width * 4;
  const raw = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * stride + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function paintIcon(size: number): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  const half = size / 2;
  const cornerR = size * 0.22;  // rounded-square corner radius
  const discR = size * 0.30;    // coin disc
  const bg: [number, number, number] = [248, 250, 252];   // slate-50
  const disc: [number, number, number] = [37, 99, 235];   // blue-600
  const inner: [number, number, number] = [29, 78, 216];  // blue-700 (coin ring)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const px = x + 0.5, py = y + 0.5;
      // rounded-square signed distance
      const dx = Math.abs(px - half) - (half - cornerR);
      const dy = Math.abs(py - half) - (half - cornerR);
      const dist = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
      const inside = dist <= 0;

      const d = Math.hypot(px - half, py - half);
      const [r, g, b] = d < discR * 0.72 ? inner : d <= discR ? disc : bg;
      rgba[i] = inside ? r : 0;
      rgba[i + 1] = inside ? g : 0;
      rgba[i + 2] = inside ? b : 0;
      rgba[i + 3] = inside ? 255 : 0;
    }
  }
  return rgba;
}

const outDir = join(import.meta.dir, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const png = pngFromRgba(size, size, paintIcon(size));
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
