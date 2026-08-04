/**
 * Build genuinely valid PNGs for tests — correct CRCs, real zlib-compressed
 * IDAT, both indexed (colour type 3) and truecolour (colour type 2).
 *
 * The CRCs are computed properly even though src/png-palette.ts does not
 * verify them. A fixture that is only valid enough for the reader under test
 * is a fixture that stops being a test the moment anything else looks at it.
 */
import { deflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function ihdr(width: number, height: number, colourType: number): Buffer {
  const d = Buffer.alloc(13);
  d.writeUInt32BE(width, 0);
  d.writeUInt32BE(height, 4);
  d.writeUInt8(8, 8); // bit depth
  d.writeUInt8(colourType, 9);
  d.writeUInt8(0, 10); // compression
  d.writeUInt8(0, 11); // filter
  d.writeUInt8(0, 12); // interlace
  return chunk('IHDR', d);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error(`bad hex ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * An INDEXED PNG whose PLTE is exactly `palette`. `rows` are palette indices;
 * defaults to a 2x2 cycling through the palette.
 */
export function indexedPng(palette: string[], rows?: number[][]): Buffer {
  const pixels = rows ?? [
    [0, palette.length > 1 ? 1 : 0],
    [palette.length > 1 ? 1 : 0, 0],
  ];
  const height = pixels.length;
  const width = pixels[0]!.length;

  const plteData = Buffer.concat(palette.map(c => Buffer.from(hexToRgb(c))));
  // Each scanline is prefixed with its filter byte (0 = None).
  const raw = Buffer.concat(pixels.map(row => Buffer.concat([Buffer.from([0]), Buffer.from(row)])));

  return Buffer.concat([
    PNG_SIGNATURE,
    ihdr(width, height, 3),
    chunk('PLTE', plteData),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A TRUECOLOUR PNG (colour type 2) — has no PLTE, so no palette bound exists. */
export function truecolourPng(colours: string[]): Buffer {
  const width = colours.length;
  const raw = Buffer.concat([
    Buffer.from([0]),
    ...colours.map(c => Buffer.from(hexToRgb(c))),
  ]);
  return Buffer.concat([
    PNG_SIGNATURE,
    ihdr(width, 1, 2),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
