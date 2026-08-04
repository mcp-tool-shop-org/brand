/**
 * Build the degenerate 3D fixture: a unit cube with two tiny channels.
 *
 *   node tests/_helpers/make-cube-fixture.mjs <outDir>
 *
 * This exists as a GENERATOR rather than a committed binary blob so the
 * fixture is reproducible and reviewable. A checked-in .glb nobody can
 * regenerate is a mystery file, and a fixture whose provenance is "someone
 * made it once" is exactly the kind of unverifiable artifact this repo's
 * manifest exists to prevent.
 *
 * The cube is deliberately the DEGENERATE case, beside degenerate.view.json:
 * two non-categorical channels, no provenance block, no cameras, no budget.
 * It proves the route renders something that is not the rich subject, so the
 * viewer never grows a shape that only fits one repo's data.
 *
 * glTF specifics that matter here:
 *   - KHR_materials_unlit is declared, because model-viewer skips tone mapping
 *     entirely when every material is unlit — which is what makes the flat
 *     channel a texture readout rather than a lit render.
 *   - The image is an EXTERNAL uri, not an embedded buffer view, so switching
 *     channels is an image fetch rather than a model reload, and so brand can
 *     hash each channel as its own manifest entry.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: make-cube-fixture.mjs <outDir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

// --- geometry: 24 vertices (4 per face, so each face gets its own UVs) ---
const P = [
  // +Z            -Z            +X            -X            +Y            -Y
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
  [1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1],
  [1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1],
  [-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1],
  [-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1],
];
const N = [
  [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0],
].flatMap(n => [n, n, n, n]);
const UV = Array.from({ length: 6 }, () => [[0, 1], [1, 1], [1, 0], [0, 0]]).flat();
const IDX = Array.from({ length: 6 }, (_, f) => {
  const o = f * 4;
  return [o, o + 1, o + 2, o, o + 2, o + 3];
}).flat();

const positions = Float32Array.from(P.flat());
const normals = Float32Array.from(N.flat());
const uvs = Float32Array.from(UV.flat());
const indices = Uint16Array.from(IDX);

/** Pad to a 4-byte boundary — glTF requires each buffer view to be aligned. */
function pad4(buf) {
  const rem = buf.length % 4;
  return rem === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - rem)]);
}

const parts = [
  Buffer.from(positions.buffer),
  Buffer.from(normals.buffer),
  Buffer.from(uvs.buffer),
  pad4(Buffer.from(indices.buffer)),
];
const offsets = [];
let running = 0;
for (const p of parts) {
  offsets.push(running);
  running += p.length;
}
const bin = Buffer.concat(parts);

const min = (arr, stride, i) => Math.min(...arr.filter((_, k) => k % stride === i));
const max = (arr, stride, i) => Math.max(...arr.filter((_, k) => k % stride === i));
const posArr = [...positions];

const gltf = {
  asset: { version: '2.0', generator: 'brand tests/_helpers/make-cube-fixture.mjs' },
  extensionsUsed: ['KHR_materials_unlit'],
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'cube' }],
  meshes: [
    {
      name: 'cube',
      primitives: [
        { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 },
      ],
    },
  ],
  materials: [
    {
      name: 'channel',
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
      // Unlit: model-viewer skips tone mapping when every material declares
      // this, so baseColor RGB reaches the screen unchanged.
      extensions: { KHR_materials_unlit: {} },
    },
  ],
  textures: [{ sampler: 0, source: 0 }],
  // NEAREST/NEAREST — the degenerate fixture is not categorical, but the
  // sampler is pinned anyway so the fixture exercises the same path a
  // categorical channel takes.
  samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }],
  images: [{ uri: 'ch_matte.png' }],
  buffers: [{ byteLength: bin.length }],
  bufferViews: [
    { buffer: 0, byteOffset: offsets[0], byteLength: parts[0].length, target: 34962 },
    { buffer: 0, byteOffset: offsets[1], byteLength: parts[1].length, target: 34962 },
    { buffer: 0, byteOffset: offsets[2], byteLength: parts[2].length, target: 34962 },
    { buffer: 0, byteOffset: offsets[3], byteLength: parts[3].length, target: 34963 },
  ],
  accessors: [
    {
      bufferView: 0, componentType: 5126, count: 24, type: 'VEC3',
      min: [min(posArr, 3, 0), min(posArr, 3, 1), min(posArr, 3, 2)],
      max: [max(posArr, 3, 0), max(posArr, 3, 1), max(posArr, 3, 2)],
    },
    { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: 24, type: 'VEC2' },
    { bufferView: 3, componentType: 5123, count: 36, type: 'SCALAR' },
  ],
};

// --- GLB container: 12-byte header + JSON chunk + BIN chunk ---
function chunk(type, data) {
  const padded =
    type === 'JSON'
      ? Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4, 0x20)]) // pad with spaces
      : pad4(data);
  const header = Buffer.alloc(8);
  header.writeUInt32LE(padded.length, 0);
  header.write(type === 'JSON' ? 'JSON' : 'BIN\0', 4, 4, 'ascii');
  return Buffer.concat([header, padded]);
}

const jsonChunk = chunk('JSON', Buffer.from(JSON.stringify(gltf), 'utf8'));
const binChunk = chunk('BIN', bin);
const header = Buffer.alloc(12);
header.write('glTF', 0, 4, 'ascii');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + jsonChunk.length + binChunk.length, 8);

writeFileSync(join(outDir, 'asset.glb'), Buffer.concat([header, jsonChunk, binChunk]));

// --- two tiny channels, both non-categorical (the degenerate case) ---
// Written as indexed PNGs anyway: the encoder is shared with the categorical
// path, so the fixture exercises it even though CHECK-CAT will not run here.
const { indexedPng } = await import('./png-builder.mjs');
writeFileSync(join(outDir, 'ch_matte.png'), indexedPng(['#3f3f46', '#52525b']));
writeFileSync(join(outDir, 'ch_metallic.png'), indexedPng(['#d4d4d8', '#a1a1aa']));

writeFileSync(
  join(outDir, 'view.json'),
  JSON.stringify(
    {
      schema: 'brand.model-view/1',
      asset: 'asset.glb',
      channels: [
        { id: 'matte', label: 'Matte', texture: 'ch_matte.png', filter: 'nearest', categorical: false },
        { id: 'metallic', label: 'Metallic', texture: 'ch_metallic.png', filter: 'nearest', categorical: false },
      ],
    },
    null,
    2
  ) + '\n'
);

console.log(`cube fixture written to ${outDir}`);
