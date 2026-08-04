# indented-4sp-multiline

Wrap your logo in a centered paragraph, one line per variant:

    <p><img src="assets/logo-a.png" alt="ExampleA" width="400"></p>
    <p><img src="assets/logo-b.png" alt="ExampleB" width="400"></p>
    <p><img src="assets/logo-c.png" alt="ExampleC" width="400"></p>

Every line above is one 4-space-indented code block — a DOCUMENTATION
EXAMPLE, not three live logos. The single-line `indented-4sp.md` fixture
could not catch the multi-line bug: the old gate re-tested "is the previous
line blank?" on every line, so it admitted only the FIRST line of a run.
Lines 2 and 3 were classified as live and were eligible for rewriting.

<p align="center">
  <img src="assets/logo.png" alt="RealLogo" width="400">
</p>

The un-indented tag above IS the real logo — proof the indented run is
closed by the blank line and does not swallow the rest of the document.
