# marker-indented-multiline

Indent the snippet by four spaces to show it verbatim:

    <!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
    <p><img src="example/front.png" alt="Example"></p>
    <!-- brand:gallery:end -->

All three lines above are one 4-space-indented code block — a DOCUMENTATION
EXAMPLE, not a live marker block. Under the old gate only the FIRST line
(the start marker) counted as code; the `brand:gallery:end` on the run's
third line was treated as live, leaving a dangling end marker with no
matching start.

This document has no real `brand:gallery` block, so `findMarkerBlocks` must
return an empty array and `syncMarkerBlock` must report "not found" rather
than splicing rendered HTML into the indented example.
