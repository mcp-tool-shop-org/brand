# Spec — model channels: hosted 3D assets with switchable evidence layers

**Status:** proposed, not built. **Author:** showcase session, 2026-08-04.
**Companion spec:** facet `docs/experiments/E09-display-copy.md` — the subject-side recipe that
produces the artifacts this spec hosts. Neither spec blocks the other's schedule.

---

## The question

Can brand host an interactive 3D asset whose **texture channel can be switched at runtime**, so
a repo's README can point at evidence rather than recite it — without brand learning any
subject's vocabulary?

## Why this is brand's job and not the subject repo's

brand already solves the two hard parts. `manifest.json` gives every asset a SHA-256 and a
`role`, and `brand verify` checks it byte for byte — which is exactly what a **derived display
artifact** needs, since it is not the source of truth and must prove what it came from. And the
Astro site already deploys to Pages. Subject repos stay light; brand carries weight, which is
what brand is for.

The `gallery` role already anticipates showcase content — the README names "a sprite pack's
character turnarounds" as the motivating case. A model with channels is that idea one dimension
up.

## The north star

A rotating character proves nothing; anyone can post a character. **The channel flip discharges
a measured claim on contact.** A repo asserts a number in prose; the viewer shows the reader
which texels it refers to. That is the feature, and it generalises to any repo with something to
prove.

---

## The seam — non-negotiable

**brand supplies the mechanism. The subject repo supplies the semantics.**

brand must never contain the word "provenance", "owner map", "twin", or any other subject term.
It reads an ordered list of channels and renders them. Labels, captions, camera presets and
receipts are **data**, authored by the subject repo in `view.json`.

This is `DECOMPOSE_BY_SECRETS` (Parnas 1972): channel semantics change per subject; the viewer
does not. The test for whether the seam holds is fixture 3 below — a subject must be able to add
a channel with **zero brand code change**.

---

## What reading the code changed

Two findings from `src/manifest.ts` that invalidate the obvious layout:

1. **Discovery is two-level bounded.** The slug walker registers `<slug>/readme.<ext>` as
   `role: "primary"` and `<slug>/<anyDir>/<file>.<ext>` as `role: "gallery"` with
   `gallery: <anyDir>`. A nested `model/channels/flat.webp` is **three levels and would not be
   discovered at all.**
2. **A `model/` folder auto-registers as `gallery` today.** The walker catches *any*
   subdirectory. Dropping model files in without touching `manifest.ts` does not error — it
   silently mis-roles them, and `brand stats` would count them as gallery images.

So the layout must be flat, and:

> **GATE-SEQUENCE (sequencing gate, not a preference).** The `model` role and the `model/`
> discovery path land in `manifest.ts` **before the first model file exists on disk**. A `model/`
> folder created ahead of the role does not error — it silently registers as `role: "gallery"`,
> and `brand stats` counts models as gallery images. There is no failure to notice and correct
> later; the defect is a wrong manifest that looks right.

### Staging directories must be denylist-covered

`remove.ts` records the rule and the reasoning: it deliberately reused `add-gallery.ts`'s
existing `.brand-backup-<name>-<pid>-<timestamp>` prefix rather than inventing `.brand-removed-*`,
because a brand-new prefix would **not** be covered by `manifest.ts`'s
`GALLERY_SCRATCH_DIR_PATTERNS` denylist — `manifest.ts` sits outside that command's owned globs,
so a new prefix would have required routing a denylist addition to the coordinator. Reusing the
existing prefix got both of `manifest.ts`'s defences for free, immediately, with no cross-domain
dependency.

**`add-model` inherits this rule.** Any staging, backup or scratch directory it introduces either
reuses `.brand-backup-*` or ships with its denylist entry in the same change. A staging directory
outside the denylist means the manifest hashes transient files — a manifest that is wrong the
moment it is generated.

### Layout

```
logos/<slug>/
  readme.png                role: primary
  turnarounds/...           role: gallery      (unchanged)
  model/
    asset.glb               role: model
    ch_<id>.<ext>           role: channel      (flat file, no nesting)
    view.json               role: model-manifest
```

`SUPPORTED_FORMATS` in `src/manifest.ts` is image-only and carries an explicit "Add new formats
here ONLY" warning — `FORMAT_MAP`, `IMAGE_EXTENSIONS`, `IMAGE_EXTENSION_ORDER` and the stats glob
are all derived from it. Adding `glb` and `json` means either extending that list (and auditing
all four derived consumers) or giving `model/` its own discovery path. **Prefer the second:** a
model is not an image, and widening an image list to carry non-images is the shared-constant
reuse that breaks consumers nobody remembered.

---

## `view.json` — the schema

```jsonc
{
  "schema": "brand.model-view/1",
  "asset": "asset.glb",
  "subject": "facet W3 warrior",              // free text, display only
  "provenance": {
    "source_repo": "mcp-tool-shop-org/facet",
    "source_spec": "docs/experiments/E09-display-copy.md",
    "derived_from": "W3_final.glb",
    "recipe": "<exact argv, filled by E09>",
    "receipt": { "metric": "mean abs channel delta /255", "value": null, "against": "287k source, flat render" }
  },
  "channels": [
    {
      "id": "flat",
      "label": "Texture",
      "texture": "ch_flat.webp",
      "filter": "linear",
      "categorical": false,
      "caption": "The finished asset under flat light."
    },
    {
      "id": "provenance",
      "label": "Where each texel came from",
      "texture": "ch_provenance.png",
      "filter": "nearest",
      "categorical": true,
      "palette": ["#000000", "#3b7dd8", "#d8a13b", "#8d3bd8"],
      "legend": { "#3b7dd8": "styled reference", "#d8a13b": "diffusion", "#8d3bd8": "interpolated" },
      "caption": "<subject-authored>"
    }
  ],
  "cameras": [ { "label": "front", "orbit": "0deg 90deg 2.2m" } ],
  "budget": { "asset_bytes": 8388608, "channel_bytes": 1572864, "poster_bytes": 307200 }
}
```

`categorical: true` is the load-bearing field. It is not documentation — it switches on the
enforcement below. `receipt.value` is `null` here deliberately: this spec does not know the
number, and E09 must not have it retro-fitted to whatever it measures.

---

## The categorical constraint, enforced

A categorical channel encodes **class membership as colour**. Blending two class colours produces
a class no camera produced — a fabricated measurement rendered as fact. Lossy compression, linear
filtering and mipmap generation all blend.

Stating the constraint in a schema is not enforcing it. **Specify a check that can fail:**

**CHECK-CAT.** For every channel with `categorical: true`, assert the **served bytes** decode to
a colour set that is a subset of `palette`. Runs after: `add-model` ingest, `manifest`
regeneration, the Astro build, and any future texture-optimisation pass. Non-zero exit halts the
step. Written against the *specification* — "is anything outside the declared palette" — not
against a defect someone happened to notice.

**CHECK-MIP.** `sampler.minFilter = NEAREST` is a declaration, not proof that mips were never
generated. Verify the rendered result, not the setting. Three acceptable resolutions, strongest
last:

1. Prove no mip chain is built for the channel, **or**
2. Serve the channel at a resolution where mip selection never engages across the viewer's
   clamped zoom range, **or**
3. Sample the rendered canvas and apply CHECK-CAT to the framebuffer pixels.

Write 3 if 1 and 2 are ambiguous. A check whose failure mode you cannot describe is not a check.

**Both checks live inside the tool that performs the step**, not chained after it in a shell. A
shell chain is a transport, not a guard.

### Where CHECK-CAT lives — `audit --remote` was evaluated and does not fit

The hypothesis was that v1.1.0's `audit --remote` already fetches deployed assets and compares
them against manifest hashes, giving the served-bytes check a shipped home. **Read, and
falsified.** `audit --remote` calls `GET /repos/{org}/{slug}/readme` against the GitHub Contents
API and lints the `<img>` logo tags inside the returned README — its issue vocabulary is
`indentation-trap`, `multiple-logo-matches`, `missing-brand-asset`, `no-readme`,
`readme-unreadable`. It is a **README-reference linter**. It never fetches an image, never
fetches a model, and never compares asset bytes to anything. The `--remote` in its name means
"read repos over the API instead of local clones," not "fetch what is deployed."

So CHECK-CAT does not extend it. It composes out of two things instead, and the composition is
cheaper than re-decoding pixels everywhere:

1. **`add-model` decodes once, at ingest.** Full palette conformance over the decoded image.
   Expensive, run exactly once per artifact.
2. **`brand verify` proves the bytes have not changed since.** It already hashes working-tree
   bytes against the manifest (`manifest.ts:132`). Hash equality does not test palette
   conformance — but conformance *at ingest* plus *unchanged bytes* gives conformance now, by
   induction. No pixel decoding is bolted onto `verify`.

**The induction rests on two legs, and both must be verified. Neither is a caveat.** It holds
only while the served bytes *are* the hashed bytes, and there are two places that can stop being
true:

**Leg 1 — the build.** Astro's image pipeline re-encodes assets during build by default, which
would silently break conformance. **Categorical channels must bypass site image optimisation
entirely and be served as byte-identical static passthrough.** Assert in step 3 by hashing the
file in `dist/` against the manifest. A mismatch means the build re-encoded a categorical
channel: halt.

**Leg 2 — the delivery.** `dist/` being correct only helps if Pages serves it byte-identically.
That is true today, but it is an assumption about infrastructure we do not control, and an
unverified assumption is the whole failure class this check exists to close. **One-shot check at
first deploy:** fetch each categorical channel from its live URL once, hash the response body,
compare against the manifest, and **record the result and date in this spec**.

After that single measurement both legs are verified and the induction carries. No standing
served-bytes machinery is needed — which was the point of composing the check this way rather
than building a fetcher. Re-run the one-shot only if the hosting or build pipeline changes.

> **First-deploy served-bytes measurement:** not yet taken. Record here: date, URL per channel,
> response-body SHA-256, manifest SHA-256, match y/n.

The failure this closes is the one this workspace calls *a working viewer that looks right* — a
categorical channel silently re-encoded somewhere in delivery fabricates classes downstream of
every passing check, and every check would keep passing.

---

## Fixtures — two, because one cannot prove a boundary

| # | fixture | proves |
|---|---|---|
| 1 | **facet** — 3 channels, full provenance block, camera presets | the rich case renders and verifies |
| 2 | **a logo** — 2 channels, no provenance block, no cameras, nothing categorical | the degenerate case works; optional fields are genuinely optional |
| 3 | **genericity** — fixture 1 gains a 4th channel by editing `view.json` only | **zero brand code change.** This is the seam test |

Fixture 3 is not hypothetical. facet's `project_twins.py` already emits `_owner.npy` — "which
VIEW won each texel", a standing sidecar — and facet's E04 Ruling 1 records why it is a *distinct*
channel rather than a variant of provenance: an inter-camera ownership seam is
**provenance-blind by construction**, because both sides of the edge belong to the same
provenance class. The fourth channel is scheduled work, and the schema must absorb it without a
release.

---

## Byte budget — declared before the artifact exists

Pre-registered, with reasoning, and **not to be retuned after measurement**. If the recipe cannot
hit these, that is a reported result and a decision for the Director, not a reason to move the
number.

| quantity | budget | reasoning |
|---|---|---|
| first paint (poster only) | **≤ 300 KB** | `loading="lazy"` + `reveal="manual"` + `poster` means no 3D bytes load until the reader clicks. The landing-page cost is the poster, and 300 KB is an ordinary hero image |
| model payload (`asset.glb`) | **≤ 8 MB** | opt-in, post-click. Comparable to a few seconds of video, which readers accept for content they chose |
| each additional channel | **≤ 1.5 MB** | channels load on first switch, not up front |
| categorical channels | **lossless; no budget waiver** | CHECK-CAT outranks the budget. If a categorical channel exceeds 1.5 MB, reduce resolution — never quality |

Reference point: facet's source asset is 21.84 MB (287,170 tris, 4096² RGB atlas embedded).

### Compression — verify before relying on

model-viewer's docs state `dracoDecoderLocation` and `ktx2TranscoderLocation` **default to a
Google CDN**, and the Meshopt decoder is **not enabled by default**. Consequences:

- A Pages-hosted viewer relying on Draco or KTX2 has a **runtime dependency on a third-party CDN**
  unless the decoder is self-hosted and the location pinned. Pin it.
- Meshopt requires explicit enablement. Do not assume it works because the format is supported.
- KTX2/Basis is **lossy** — disqualified for categorical channels by CHECK-CAT, whatever it does
  for size.

Verify each against a real build before the budget depends on it.

---

## The decision that must be made before any binary is committed

**brand's packed git history is already 281 MiB, with no LFS.** Every binary committed to git is
permanent; the only compensator is history rewriting, which invalidates every clone. Adding
multi-megabyte models per subject compounds this in a direction that cannot be cheaply undone.

### ⚠ Corrected 2026-08-04 — the first recommendation here was Release assets. It was wrong.

The v1.1.0 command set shipped the same day this spec was written, and it changes the answer.
`brand remove`, `brand history` and `brand verify` are all **working-tree and git-path shaped**:

- `manifest.ts:132` hashes `readFileSync(filePath)` — a working-tree file. There is nothing to
  read if the artifact lives on a release.
- `brand remove` is swap-based on a real directory (rename to a `.brand-backup-*` sibling,
  regenerate the manifest, unlink only on success, reverse the rename on failure). A release
  asset has no directory to swap.
- `brand history` walks `git log` over `<logos>/<slug>/**`. A release asset leaves no path in
  git, so its history is empty by construction.

Release assets would therefore cost **three shipped, tested commands' coverage of the new role**
— which the original table scored as a single bounded change to `verify.ts`. That was an
undercount.

| option | pro | con | compensator |
|---|---|---|---|
| **commit to git** (status quo for logos) | all three commands work unchanged | permanent, compounding history bloat on a repo already at 281 MiB packed | `git filter-repo` + force push — all clones invalidated |
| **Git LFS** ⭐ | all three commands still work — paths stay in git for `history`, and the smudge filter gives `verify`/`remove` real working-tree bytes; history stays small | new dependency; clone requires LFS; **quota is billable — verify the current free tier before committing** | migrating off LFS is disruptive but does not rewrite history |
| **GitHub Release assets** | never enters git history | breaks `verify`, `remove` and `history` for models | delete the release asset; history untouched |

### ✅ RATIFIED — Git LFS (Director, 2026-08-04)

The gate is closed. LFS is the only option that bounds history growth *and* preserves the command
surface that already exists.

**The quota figures carried into this ruling were stale and are corrected here.** The advisory
number was "1 GiB storage / 1 GiB per month bandwidth, overage via paid data packs." Per
[GitHub's current LFS billing docs](https://docs.github.com/billing/managing-billing-for-git-large-file-storage/about-billing-for-git-large-file-storage):

- Free and Pro accounts get **10 GiB** of LFS storage and **10 GiB/month** of bandwidth (Team and
  Enterprise: 250 GiB) — an order of magnitude more headroom than assumed.
- **Data packs have been retired.** Billing is now metered — roughly **$0.07/GiB/month** stored
  and **$0.0875/GiB** downloaded past the free allowance.
- Unused bandwidth does **not** roll over.

The ruling stands either way; the correction changes how much headroom precedes the first bill.

**Tier confirmed 2026-08-04** — `gh api orgs/mcp-tool-shop-org` reports `plan.name: "free"`, so
the applicable budget is **10 GiB storage + 10 GiB/month bandwidth**, metered past that. No
question to the Director was needed. `git-lfs 3.7.1` is installed on this rig and
`filter.lfs.required=true` is set globally, so a machine without git-lfs fails loudly rather than
silently committing pointer text as content.

**QUOTA-CHECK (pre-registered, before any multi-subject rollout).** Measure **one** CI build's
actual LFS pull in GiB, multiply by the monthly build count, and compare against the confirmed
tier. Declared now so the threshold is not chosen after seeing the bill. One subject at roughly
25 MB will not threaten 10 GiB; ten subjects with uncached CI checkouts might, and the
multiplier is build count, not visitor count.

Site visitors do **not** consume LFS bandwidth: the Astro build copies assets into `dist/` and
Pages serves them. That is the mechanism, and it is a claim to confirm against a real build
during step 3 — not to assume.

### What already answers provenance-over-time

`brand history <slug>` walks git for every change under a slug's path, newest first. The
`view.json.provenance` block records **what a model was derived from**; `brand history` records
**when it changed**. These are different questions and the spec should not reinvent the second.

---

## Build order

| step | side | blocked by |
|---|---|---|
| 0 | LFS tracking for `logos/*/model/**` + confirm the org's LFS tier | **unblocked** — Director ratified 2026-08-04 |
| 1 | `view.json` schema + `model`/`channel` roles + the `model/` discovery path (**GATE-SEQUENCE**) | nothing — pure schema, no 3D |
| 2 | `brand add-model`, hashing, `verify` coverage, CHECK-CAT at ingest | steps 0 and 1 |
| 3 | Astro route `/<slug>/view/` + channel switcher + CHECK-MIP + the `dist/` passthrough hash assert | step 1 (parallel to 2) |
| 4 | fixtures 1–3, then QUOTA-CHECK before any second subject | steps 1–3 |

Steps 1 and 3 need no 3D asset and no facet involvement — they can run against fixture 2, the
degenerate logo case. Nothing blocks them now.

---

## Out of scope

- **Per-node / per-part visibility toggling.** model-viewer has **no visibility API** — confirmed
  in `packages/model-viewer/src/features/scene-graph/api.ts` (the `Model` interface exposes
  `materials` and variant methods only; no `nodes`, no `visible`) and stated by the maintainer in
  discussion #4461: *"model-viewer has no visibility API, so you must be hacking down to the
  three.js layer underneath."* The interesting toggle here is **channel**, not part.
- Animation, AR, Gaussian splats, measurement tools, section planes.
- Editing or authoring assets in the browser. brand hosts and verifies; it does not produce.
- Any subject-specific rendering. If a subject needs a bespoke shader, the seam has failed and the
  design should be revisited rather than special-cased.

---

## Standards compliance

Scored 0–3 against the six workflow standards. A score below 2 carries a named remediation.

**1. PIN_PER_STEP — 2.** The display-copy recipe is pinned in facet's E09 and its output hashed in
`manifest.json`; `view.json.provenance` records the recipe and source artifact, so a served model
is traceable to the command that made it. Not 3: the recipe field is prose until E09 fills it with
exact argv. *Remediation: store exact argv in `provenance.recipe` — owner: showcase session,
target: step 1.*

**2. ANDON_AUTHORITY — 2.** CHECK-CAT halts `add-model` ingest on a fabricated categorical colour;
the `dist/` passthrough hash assert halts the site build if Astro re-encodes a categorical channel
and breaks the conformance induction; CHECK-MIP halts on an unproven filter path; GATE-SEQUENCE
refuses to write into a tree whose manifest was generated before the `model` role existed. All
specified inside the tool that performs the step.

*Updated after step 1 (2026-08-04):* GATE-SEQUENCE is no longer prose — `findMisroledModelAssets`
is implemented in `src/manifest.ts` with tests, and `parseModelView` refuses a categorical channel
that is linear-filtered or declares no palette, so an unenforceable declaration cannot be written
in the first place. CHECK-CAT, CHECK-MIP and the `dist/` assert remain unbuilt (steps 2–3), which
is what holds this at 2 rather than 3.

**3. NAMED_COMPENSATORS — 2.** Table below; no skip claimed. Not 3 until each has been rehearsed
once.

*Corrected 2026-08-04: the first version of this table omitted `brand remove` and collapsed two
distinct failure modes into one row. Registering the wrong asset and permanently bloating git
history are different defects with different costs, and the first already has a shipped, tested
compensator.*

| irreversible action | compensator | post-rollback state | owner |
|---|---|---|---|
| register the **wrong model or channel** for a slug | **`brand remove <slug> [--gallery <name>]`** (v1.1.0) — swap-based: renames to a `.brand-backup-*` sibling, regenerates the manifest, unlinks only on success, reverses the rename if regeneration throws (exit 3). `--dry-run` is a real dry run; `--yes` gates the destructive path | working tree and manifest consistent; **git history still carries the blob** | Advisor |
| **commit a model binary** to brand git | `git filter-repo` + force push — the only compensator that reclaims history. Avoided entirely if the LFS ruling above lands | history rewritten; **all clones invalidated**; CI reruns | Director |
| `npm publish @mcptoolshop/brand` | `npm deprecate` + patch release (unpublish unavailable after the npm window) | old version still resolvable by existing consumers | Director |
| `gh release create` | `gh release delete` | tag persists unless separately deleted | Director |
| Pages deploy | revert commit, redeploy | previous site restored; URL unchanged | Advisor |

The first two rows are the reason the hosting ruling is gated. `brand remove` makes a *wrong
asset* cheap to undo; nothing makes a *committed binary* cheap to undo.

**4. DECOMPOSE_BY_SECRETS — 3.** The entire design is this standard: brand holds mechanism,
`view.json` holds subject vocabulary, and fixture 3 makes the boundary falsifiable by requiring a
new channel with zero brand code change.

**5. UNCERTAINTY_GATED_HUMANS — 2.** One human gate, on the genuinely irreversible decision (binary
hosting), framed contrastively: *you probably expect models to be committed like logos are; I
recommend Release assets instead, because git history bloat is the only cost here with no cheap
compensator.* Not 3 until the gate is enforced by a check rather than by this paragraph.

**6. EXTERNAL_VERIFIER — 2.** The fidelity receipt is computed by facet's toolchain and consumed by
brand; brand independently re-derives the SHA-256 rather than trusting a supplied one. The
generator does not grade itself. Not 3: both sides are the same author this session — the receipt
should be reproduced by a session that did not produce it.
