```html
<p align="center">
  <img src="assets/logo.png" alt="DocExampleOnly" width="400">
</p>
```

A project authored on Windows with a UTF-8 BOM, whose very FIRST line opens a
fenced code block showing how to add a logo, as documentation. The BOM must
not defeat the fence-open regex and wrongly leave this example live.

This file has no OTHER real logo occurrence — findLogoImgTags must return an
empty array.
