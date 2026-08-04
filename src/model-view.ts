/**
 * view.json — the subject-authored description of a model's switchable
 * channels. See docs/model-channels-spec.md.
 *
 * THE SEAM: this module is the boundary between brand's mechanism and a
 * subject repo's semantics. brand reads an ordered list of channels and
 * renders them; the labels, captions, palettes, camera presets and provenance
 * receipts are DATA authored by the subject. Nothing here may learn a subject
 * word — not "provenance", not "owner map", not "twin". If a term like that
 * ever appears in this file, the seam has failed.
 *
 * The test for the seam is fixture 3: a subject must be able to add a fourth
 * channel by editing its own view.json, with zero change to this file.
 */

/** Texture sampling. "nearest" is REQUIRED for categorical channels. */
export type ChannelFilter = 'linear' | 'nearest';

export interface ModelChannel {
  /** Stable identifier, unique within the view (e.g. "flat"). */
  id: string;
  /** Human-facing switcher label. Subject vocabulary — brand only displays it. */
  label: string;
  /** File name of the texture, relative to the model/ directory. */
  texture: string;
  filter: ChannelFilter;
  /**
   * True when the texture encodes CLASS MEMBERSHIP AS COLOUR. Load-bearing:
   * it is not documentation, it switches on enforcement. Blending two class
   * colours produces a class that was never measured, so a categorical
   * channel must be nearest-filtered and must declare the exact colour set it
   * is allowed to contain.
   */
  categorical: boolean;
  /** Required (non-empty) when categorical. Hex colours, e.g. "#3b7dd8". */
  palette?: string[];
  /** Optional colour -> meaning map for a rendered legend. Subject vocabulary. */
  legend?: Record<string, string>;
  /** Optional caption shown with the channel. Subject vocabulary. */
  caption?: string;
}

export interface ModelViewProvenance {
  source_repo?: string;
  source_spec?: string;
  derived_from?: string;
  /** Exact argv of the command that produced the display copy. */
  recipe?: string;
  /**
   * The subject's own fidelity measurement of the derived artifact against
   * its source. brand stores and displays it; brand never computes or
   * interprets it — the metric name is the subject's to choose.
   */
  receipt?: { metric?: string; value?: number | null; against?: string };
}

export interface ModelViewCamera {
  label: string;
  /** Viewer-native orbit string, passed through verbatim. */
  orbit: string;
}

export interface ModelView {
  schema: string;
  /** File name of the 3D asset, relative to the model/ directory. */
  asset: string;
  /** Free text, display only. */
  subject?: string;
  provenance?: ModelViewProvenance;
  channels: ModelChannel[];
  cameras?: ModelViewCamera[];
  budget?: { asset_bytes?: number; channel_bytes?: number; poster_bytes?: number };
}

/** The only schema identifier this build reads. */
export const MODEL_VIEW_SCHEMA = 'brand.model-view/1';

export class ModelViewParseError extends Error {
  readonly path: string;
  constructor(message: string, path: string) {
    super(message);
    this.name = 'ModelViewParseError';
    this.path = path;
  }
}

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

function fail(path: string, message: string): never {
  throw new ModelViewParseError(message, path);
}

/**
 * Parse and structurally validate a view.json.
 *
 * Validation is deliberately limited to what brand can check WITHOUT knowing
 * the subject: required fields exist and have the right shape, ids are
 * unique, and the categorical invariants hold. Whether a palette is the RIGHT
 * palette for a subject's classes is the subject's business and is enforced
 * on its side (CHECK-CAT at ingest compares the decoded image against this
 * declared palette — see the spec).
 *
 * `raw` is the already-read file contents; callers own the I/O so this stays
 * testable without a filesystem.
 */
export function parseModelView(raw: string, path: string): ModelView {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    fail(path, `Invalid JSON: ${(err as Error).message}`);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    fail(path, 'Expected a JSON object at the top level.');
  }
  const v = data as Record<string, unknown>;

  if (v.schema !== MODEL_VIEW_SCHEMA) {
    fail(
      path,
      `Unsupported schema ${JSON.stringify(v.schema)} — this build reads "${MODEL_VIEW_SCHEMA}".`
    );
  }
  if (typeof v.asset !== 'string' || v.asset.length === 0) {
    fail(path, '"asset" must be a non-empty string naming the model file.');
  }
  if (!Array.isArray(v.channels) || v.channels.length === 0) {
    fail(path, '"channels" must be a non-empty array — a view with no channel shows nothing.');
  }

  const seen = new Set<string>();
  const channels: ModelChannel[] = v.channels.map((entry, i) => {
    const at = `channels[${i}]`;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      fail(path, `${at} must be an object.`);
    }
    const c = entry as Record<string, unknown>;

    for (const field of ['id', 'label', 'texture'] as const) {
      if (typeof c[field] !== 'string' || (c[field] as string).length === 0) {
        fail(path, `${at}.${field} must be a non-empty string.`);
      }
    }
    const id = c.id as string;
    if (seen.has(id)) fail(path, `${at}.id "${id}" is duplicated — channel ids must be unique.`);
    seen.add(id);

    if (c.filter !== 'linear' && c.filter !== 'nearest') {
      fail(path, `${at}.filter must be "linear" or "nearest".`);
    }
    if (typeof c.categorical !== 'boolean') {
      fail(path, `${at}.categorical must be a boolean.`);
    }

    // The categorical invariants. Both are refusals, not warnings: a
    // categorical channel that is linear-filtered or has no declared palette
    // cannot be checked for fabricated classes at all, and an unenforceable
    // declaration is worse than an absent one because it reads as a guarantee.
    if (c.categorical === true) {
      if (c.filter !== 'nearest') {
        fail(
          path,
          `${at} is categorical but filter is "${String(c.filter)}". Categorical channels ` +
            'must be "nearest": linear filtering blends class colours into classes that were ' +
            'never measured.'
        );
      }
      if (!Array.isArray(c.palette) || c.palette.length === 0) {
        fail(
          path,
          `${at} is categorical but declares no palette. The palette is what makes a ` +
            'fabricated class detectable; without it the categorical flag cannot be enforced.'
        );
      }
      for (const [j, colour] of (c.palette as unknown[]).entries()) {
        if (typeof colour !== 'string' || !HEX_COLOUR.test(colour)) {
          fail(path, `${at}.palette[${j}] must be a "#rrggbb" hex string, got ${JSON.stringify(colour)}.`);
        }
      }
    }

    return {
      id,
      label: c.label as string,
      texture: c.texture as string,
      filter: c.filter,
      categorical: c.categorical,
      ...(c.palette ? { palette: c.palette as string[] } : {}),
      ...(c.legend ? { legend: c.legend as Record<string, string> } : {}),
      ...(c.caption ? { caption: c.caption as string } : {}),
    };
  });

  return {
    schema: v.schema as string,
    asset: v.asset as string,
    ...(typeof v.subject === 'string' ? { subject: v.subject } : {}),
    ...(v.provenance ? { provenance: v.provenance as ModelViewProvenance } : {}),
    channels,
    ...(Array.isArray(v.cameras) ? { cameras: v.cameras as ModelViewCamera[] } : {}),
    ...(v.budget ? { budget: v.budget as ModelView['budget'] } : {}),
  };
}
