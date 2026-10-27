// Writes public/icon-192.png and icon-512.png (baby face on purple) with no image deps.
// Features stay inside the central 80% so the icon also works as a maskable (circle/squircle) icon.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}

const BG = [76, 64, 160], SKIN = [255, 214, 170], EAR = [240, 190, 145], DARK = [60, 40, 40], CHEEK = [255, 160, 160], HAIR = [120, 80, 50], WHITE = [255, 255, 255]
const d = (x, y, cx, cy) => Math.hypot(x - cx, y - cy)

/** Color at unit coordinates (0..1); painter's order, last match wins. */
function color(x, y) {
  let c = BG
  if (d(x, y, 0.2, 0.52) < 0.08 || d(x, y, 0.8, 0.52) < 0.08) c = EAR // ears
  if (d(x, y, 0.5, 0.53) < 0.3) c = SKIN // face
  if (d(x, y, 0.27, 0.62) < 0.055 || d(x, y, 0.73, 0.62) < 0.055) c = CHEEK
  if (d(x, y, 0.37, 0.5) < 0.04 || d(x, y, 0.63, 0.5) < 0.04) c = DARK // eyes
  if (d(x, y, 0.385, 0.485) < 0.013 || d(x, y, 0.645, 0.485) < 0.013) c = WHITE // eye shine
  const r = d(x, y, 0.5, 0.6) // smile: lower part of a ring
  if (r > 0.1 && r < 0.13 && y > 0.63) c = DARK
  const cr = d(x, y, 0.53, 0.24) // hair curl: ring with a gap on the lower right
  if (cr > 0.035 && cr < 0.065 && !(x > 0.53 && y > 0.24)) c = HAIR
  return c
}

const SS = 4 // supersampling for smooth edges
for (const size of [192, 512]) {
  const stride = size * 3 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0]
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = color((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size)
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
      }
      raw.set(acc.map(v => Math.round(v / (SS * SS))), y * stride + 1 + x * 3)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
  writeFileSync(`public/icon-${size}.png`, png)
}
