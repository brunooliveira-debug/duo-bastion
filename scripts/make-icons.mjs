// Generates original PWA icons (no external assets): a glowing Core crystal between two lane colors.
import fs from 'node:fs';
import zlib from 'node:zlib';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, hgt, px) {
  const raw = Buffer.alloc((w * 4 + 1) * hgt);
  for (let y = 0; y < hgt; y++) { raw[y * (w * 4 + 1)] = 0; px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(hgt, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const mix = (a, b, t) => a + (b - a) * t;
function draw(size, { rounded = true, pad = 0 } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const S = 4; // supersampling
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const u = (x + (sx + 0.5) / S) / size, v = (y + (sy + 0.5) / S) / size;
      // rounded square mask
      const m = 0.18, cu = Math.max(Math.abs(u - 0.5) - (0.5 - m), 0), cv = Math.max(Math.abs(v - 0.5) - (0.5 - m), 0);
      if (rounded && Math.hypot(cu, cv) > m) continue;
      // background radial gradient
      const d = Math.hypot(u - 0.5, v - 0.45);
      let cr = mix(40, 10, Math.min(1, d * 1.6)), cg = mix(52, 12, Math.min(1, d * 1.6)), cb = mix(110, 30, Math.min(1, d * 1.6));
      const q = (p) => (p - 0.5) / (1 - pad * 2) + 0.5;
      const U = q(u), V = q(v);
      // lanes (left blue, right orange)
      if (V > 0.62 && V < 0.74 && (U < 0.4 || U > 0.6) && U > 0.06 && U < 0.94) {
        const left = U < 0.5;
        cr = left ? 74 : 255; cg = left ? 168 : 162; cb = left ? 255 : 58;
      }
      // glow
      const gd = Math.hypot(U - 0.5, (V - 0.45) * 0.8);
      const glow = Math.max(0, 1 - gd / 0.32);
      cr += 60 * glow * glow; cg += 160 * glow * glow; cb += 200 * glow * glow;
      // crystal (diamond)
      const dx = Math.abs(U - 0.5) / 0.17, dy = Math.abs(V - 0.42) / 0.3;
      if (dx + dy < 1) {
        const side = U < 0.5 ? 1 : 0.75, top = V < 0.42 ? 1 : 0.8;
        cr = 150 * side * top + 60; cg = 235 * side * top; cb = 255 * side * top;
        if (dx + dy > 0.86) { cr = 240; cg = 255; cb = 255; }
      }
      r += Math.min(255, cr); g += Math.min(255, cg); b += Math.min(255, cb); a += 255;
    }
    const n = S * S, i = (y * size + x) * 4;
    const cov = a / 255;
    px[i] = cov ? r / cov : 0; px[i + 1] = cov ? g / cov : 0; px[i + 2] = cov ? b / cov : 0; px[i + 3] = a / n;
  }
  return png(size, size, px);
}
fs.mkdirSync('public/icons', { recursive: true });
fs.writeFileSync('public/icons/icon-192.png', draw(192));
fs.writeFileSync('public/icons/icon-512.png', draw(512));
fs.writeFileSync('public/icons/icon-512-maskable.png', draw(512, { rounded: false, pad: 0.1 }));
fs.writeFileSync('public/icons/apple-touch-icon.png', draw(180, { rounded: false }));
console.log('icons written');
