# Fenced Code Block

Some intro text describing how to add a logo:

```html
<p align="center"><img src="assets/logo.png" alt="Example" width="400"></p>
```

The `<img>` tag inside the fenced ```html``` block is documentation, not
an actual logo reference. The parser must NOT treat it as a logo.

This README intentionally has no real logo tag — `findLogoImgTags` should
return zero matches.
