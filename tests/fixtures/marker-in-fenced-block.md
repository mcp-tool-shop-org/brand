# marker-in-fenced-block

Add this snippet to your README to opt into the gallery block:

```html
<!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
<!-- brand:gallery:end -->
```

The pair above is a DOCUMENTATION EXAMPLE inside a fenced code block — it
must NOT be treated as a live marker block. This mirrors the bug that was
live in this very repo's own shipped README.md (F-75c9e0fc): scanRawMarkers
had no fence awareness, so `brand sync` spliced rendered HTML directly into
the fenced usage example.

This document has no OTHER `brand:gallery` occurrence, so `findMarkerBlocks`
must return an empty array.
