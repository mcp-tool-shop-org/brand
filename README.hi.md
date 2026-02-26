<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="assets/logo.jpg" alt="Brand" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/brand/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

[mcp-tool-shop-org](https://github.com/mcp-tool-shop-org) गिटहब संगठन के लिए केंद्रीकृत ब्रांड एसेट रजिस्ट्री। एक रिपॉजिटरी में सभी लोगो मौजूद हैं। प्रत्येक README फ़ाइल यहां लिंक करती है। एक बार अपडेट करें, और हर जगह अपडेट हो जाएगा।

## क्यों?

जब प्रत्येक रिपॉजिटरी में लोगो की अपनी प्रति होती है, तो डुप्लीकेशन, विचलन और असंगति होती है। ब्रांडिंग में बदलाव करने का मतलब है 80 से अधिक रिपॉजिटरी में खोज करना। यह रिपॉजिटरी इस समस्या को हल करता है - लोगो यहां मौजूद हैं, और README फ़ाइलें `raw.githubusercontent.com` यूआरएल के माध्यम से उनका उल्लेख करती हैं।

## संरचना

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 80+ repos
```

81 रिपॉजिटरी में 81 लोगो। PNG फ़ाइलें PNG ही रहेंगी, और JPEG फ़ाइलें JPEG ही रहेंगी। फ़ॉर्मेट एक ब्रांड संबंधी निर्णय है, न कि बिल्ड लक्ष्य।

## कमांड-लाइन इंटरफेस (CLI)

```bash
# Verify all logos match their manifest hashes
brand verify

# Regenerate manifest after adding/replacing a logo
brand manifest

# CI mode — fail if manifest is out of date
brand manifest --check

# Audit repos for broken refs, badge collisions, indentation traps
brand audit --repos /path/to/clones

# Migrate READMEs to point at brand repo (dry run first)
brand migrate --repos /path/to/clones --dry-run
brand migrate --repos /path/to/clones
```

## एक नया लोगो जोड़ना

1. फ़ाइल को `logos/<slug>/readme.png` (या `.jpg`) में डालें।
2. `brand manifest` कमांड चलाकर इंटीग्रिटी हैश अपडेट करें।
3. लोगो और `manifest.json` दोनों को एक साथ कमिट करें।
4. CI (निरंतर एकीकरण) सिस्टम, पुश करने पर मैनिफेस्ट को सत्यापित करता है।

## सुरक्षा

प्रत्येक लोगो को `manifest.json` में SHA-256 हैश द्वारा ट्रैक किया जाता है। CI सिस्टम, `logos/` या `manifest.json` को प्रभावित करने वाले प्रत्येक पुश पर `brand manifest --check` कमांड चलाता है। किसी भी प्रकार की विसंगति - चाहे वह आकस्मिक ओवरराइट हो, छेड़छाड़ हो, या विचलन - बिल्ड को विफल कर देती है।

पूरे विवरण के लिए [docs/handbook.md](docs/handbook.md) देखें: इसमें बताया गया है कि सिंबोलिक लिंक क्यों काम नहीं करते हैं, बैज लोगो का पता लगाने के साथ कैसे टकराते हैं, और मार्कडाउन रेंडरिंग के कौन से जाल `<img>` टैग को तोड़ देते हैं, साथ ही माइग्रेशन सुरक्षा प्रोटोकॉल भी।

## लाइसेंस

[MIT](LICENSE)
