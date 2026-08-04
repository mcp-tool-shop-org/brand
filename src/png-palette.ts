/**
 * Minimal PNG header/palette reader — the mechanism behind CHECK-CAT
 * (docs/model-channels-spec.md).
 *
 * WHY THIS EXISTS RATHER THAN AN IMAGE DECODER
 * --------------------------------------------
 * A categorical channel encodes class membership as colour, so the check that
 * matters is "does this image contain any colour outside the declared set?".
 * The obvious implementation decodes every pixel and collects distinct
 * colours — which needs a decoder dependency, is O(pixels), and is only ever
 * a SAMPLE of what the file can express.
 *
 * There is a better check available for free. In an INDEXED PNG (IHDR colour
 * type 3) the pixel data is indices into the PLTE chunk, so the set of
 * colours the image can possibly contain IS the PLTE. Reading PLTE and
 * asserting it is a subset of the declared palette therefore proves that
 * EVERY pixel is in the declared palette — by construction, not by sampling.
 * It is sound, it is O(palette entries), and it needs nothing but chunk
 * parsing.
 *
 * The cost is a constraint on the subject side: categorical channels must be
 * exported as indexed PNG. That is not a burden for a categorical image —
 * it is the natural encoding for one — and it makes fabrication harder at the
 * FORMAT level rather than merely detectable after the fact. Any re-encode to
 * truecolour or to a lossy format changes the colour type, which this reader
 * reports and the caller refuses.
 *
 * This module deliberately does NOT verify chunk CRCs. It is reading a file
 * whose bytes are separately SHA-256'd into the manifest; a corrupted PLTE
 * would fail that hash. What this needs to be is correct about structure and
 * safe against malformed input, which the bounds below enforce.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG IHDR colour type 3 — palette-indexed. The only type valid for a categorical channel. */
export const PNG_COLOUR_TYPE_INDEXED = 3;

/** A PLTE chunk holds at most 256 entries of 3 bytes each. */
const MAX_PLTE_BYTES = 256 * 3;

export interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colourType: number;
  /** Lower-case "#rrggbb" strings from PLTE, in index order. null when the file has no PLTE. */
  palette: string[] | null;
}

export class PngParseError extends Error {
  readonly path: string;
  constructor(message: string, path: string) {
    super(message);
    this.name = 'PngParseError';
    this.path = path;
  }
}

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Parse a PNG's IHDR and PLTE. `path` is used only for error messages.
 *
 * Stops as soon as both IHDR and PLTE are known (or IDAT is reached, after
 * which no PLTE may legally appear), so this never walks image data.
 */
export function readPngInfo(buf: Buffer, path: string): PngInfo {
  if (buf.length < PNG_SIGNATURE.length || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new PngParseError('Not a PNG file (bad signature).', path);
  }

  let offset = 8;
  let ihdr: { width: number; height: number; bitDepth: number; colourType: number } | null = null;
  let palette: string[] | null = null;

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;

    // Bounds check BEFORE trusting `length`: a malformed or hostile file can
    // declare a chunk that runs past the end of the buffer.
    if (length > buf.length - dataStart) {
      throw new PngParseError(`Malformed PNG: chunk "${type}" declares ${length} bytes past EOF.`, path);
    }

    if (type === 'IHDR') {
      if (length < 13) throw new PngParseError('Malformed PNG: IHDR shorter than 13 bytes.', path);
      ihdr = {
        width: buf.readUInt32BE(dataStart),
        height: buf.readUInt32BE(dataStart + 4),
        bitDepth: buf.readUInt8(dataStart + 8),
        colourType: buf.readUInt8(dataStart + 9),
      };
    } else if (type === 'PLTE') {
      if (length % 3 !== 0 || length === 0 || length > MAX_PLTE_BYTES) {
        throw new PngParseError(`Malformed PNG: PLTE length ${length} is not 3..768 and a multiple of 3.`, path);
      }
      palette = [];
      for (let i = dataStart; i < dataStart + length; i += 3) {
        palette.push(hex(buf[i]!, buf[i + 1]!, buf[i + 2]!));
      }
    } else if (type === 'IDAT' || type === 'IEND') {
      // PLTE must precede IDAT, so nothing more of interest follows.
      break;
    }

    offset = dataStart + length + 4; // + CRC
  }

  if (!ihdr) throw new PngParseError('Malformed PNG: no IHDR chunk.', path);
  return { ...ihdr, palette };
}

export interface PaletteCheckResult {
  ok: boolean;
  /** Colours present in the file's PLTE that the view.json palette does not declare. */
  undeclared: string[];
  /** Declared colours the file never uses — reported, never a failure. */
  unused: string[];
  colourType: number;
  paletteSize: number;
}

/**
 * CHECK-CAT: assert an indexed PNG's colour set is a subset of the declared
 * palette.
 *
 * Refuses a non-indexed PNG outright. That refusal is the point: in any other
 * colour type the pixel colours are NOT bounded by a palette, so a subset
 * proof is unavailable and the check would silently degrade from a proof to a
 * sample. An unenforceable check that returns "ok" is worse than no check.
 */
export function checkCategoricalPalette(
  buf: Buffer,
  declared: readonly string[],
  path: string
): PaletteCheckResult {
  const info = readPngInfo(buf, path);

  if (info.colourType !== PNG_COLOUR_TYPE_INDEXED) {
    throw new PngParseError(
      `Categorical channel must be an INDEXED PNG (IHDR colour type 3), got colour type ` +
        `${info.colourType}. Only an indexed image bounds its colours by a palette, which is ` +
        `what makes "no colour outside the declared set" provable rather than sampled.`,
      path
    );
  }
  if (!info.palette) {
    throw new PngParseError('Categorical channel is indexed but has no PLTE chunk.', path);
  }

  const declaredSet = new Set(declared.map(c => c.toLowerCase()));
  const fileSet = new Set(info.palette);

  const undeclared = [...fileSet].filter(c => !declaredSet.has(c)).sort();
  const unused = [...declaredSet].filter(c => !fileSet.has(c)).sort();

  return {
    ok: undeclared.length === 0,
    undeclared,
    unused,
    colourType: info.colourType,
    paletteSize: fileSet.size,
  };
}
