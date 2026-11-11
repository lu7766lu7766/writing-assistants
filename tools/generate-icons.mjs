import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const outDir = path.resolve('icons');
fs.mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (~c) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createIconPng(size, maskable = false) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const bg = [0x2f, 0x5d, 0x50, 0xff]; // #2F5D50
  const paper = [0xfa, 0xf7, 0xf2, 0xff]; // #FAF7F2
  const gold = [0xc9, 0xa2, 0x27, 0xff]; // #C9A227
  const line = [0x2f, 0x5d, 0x50, 0xff];

  const pad = maskable ? Math.round(size * 0.2) : Math.round(size * 0.12);
  const radius = maskable ? 0 : Math.round(size * 0.18);

  function inRoundedRect(x, y, x0, y0, x1, y1, r) {
    if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
    if (r <= 0) return true;
    const cx = x < x0 + r ? x0 + r : x > x1 - r - 1 ? x1 - r - 1 : x;
    const cy = y < y0 + r ? y0 + r : y > y1 - r - 1 ? y1 - r - 1 : y;
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  }

  const cardX0 = pad;
  const cardY0 = pad;
  const cardX1 = size - pad;
  const cardY1 = size - pad;
  const cardR = Math.round((cardX1 - cardX0) * 0.12);

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      if (!inRoundedRect(x, y, 0, 0, size, size, radius)) {
        raw[px] = 0;
        raw[px + 1] = 0;
        raw[px + 2] = 0;
        raw[px + 3] = 0;
        continue;
      }

      let color = bg;
      if (inRoundedRect(x, y, cardX0, cardY0, cardX1, cardY1, cardR)) {
        color = paper;
        // Top gold header stripe inside paper card
        const headerH = Math.round((cardY1 - cardY0) * 0.18);
        if (y < cardY0 + headerH) {
          color = gold;
        } else {
          // Horizontal writing lines
          const contentTop = cardY0 + headerH + Math.round(size * 0.08);
          const lineSpacing = Math.round(size * 0.095);
          const lineThick = Math.max(2, Math.round(size * 0.025));
          const leftM = cardX0 + Math.round((cardX1 - cardX0) * 0.15);
          const rightM = cardX1 - Math.round((cardX1 - cardX0) * 0.15);
          for (let li = 0; li < 4; li++) {
            const ly = contentTop + li * lineSpacing;
            const endX = li === 3 ? leftM + Math.round((rightM - leftM) * 0.6) : rightM;
            if (x >= leftM && x <= endX && y >= ly && y < ly + lineThick) {
              color = line;
              break;
            }
          }
        }
      }

      raw[px] = color[0];
      raw[px + 1] = color[1];
      raw[px + 2] = color[2];
      raw[px + 3] = color[3];
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

fs.writeFileSync(path.join(outDir, 'icon-192.png'), createIconPng(192, false));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), createIconPng(512, false));
fs.writeFileSync(path.join(outDir, 'maskable-512.png'), createIconPng(512, true));
console.log('Generated icons in icons/');

