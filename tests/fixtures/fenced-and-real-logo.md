# Fenced Code With Real Logo

<p align="center"><img src="assets/logo.png" alt="RealLogo" width="400"></p>

Below, in a code block, we show users HOW to add a logo. The example tag
must NOT be picked up:

```html
<p align="center"><img src="assets/example-logo.png" alt="Example" width="400"></p>
```

After the fence, here is a normal paragraph.

The parser must find exactly one match (the real logo above the fence),
not two.
