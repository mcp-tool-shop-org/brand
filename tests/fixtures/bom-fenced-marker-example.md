```html
<!-- brand:gallery:start slug="doc-example-only" -->
<!-- brand:gallery:end -->
```

A project authored on Windows with a UTF-8 BOM, whose very FIRST line opens a
fenced code block showing the marker syntax as documentation. This is the
same "fence on line 0" hazard as bom.md but for marker-parser.ts: the BOM
must not defeat the fence-open regex and wrongly leave this example live.

This file has no OTHER brand:gallery occurrence — findMarkerBlocks must
return an empty array.
