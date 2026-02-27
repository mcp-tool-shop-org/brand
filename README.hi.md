<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/assets/logo.jpg" alt="Brand" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/brand"><img src="https://img.shields.io/npm/v/@mcptoolshop/brand" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/brand/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

<p align="center">
  Centralized brand asset registry for the <a href="https://github.com/mcp-tool-shop-org">mcp-tool-shop-org</a> GitHub org.<br>
  One repo holds every logo. Every README points here. Update once, update everywhere.
</p>

---

## क्यों?

जब प्रत्येक रिपॉजिटरी में लोगो की अपनी प्रतिलिपि होती है, तो इससे दोहराव, विचलन और असंगति होती है। रीब्रांडिंग का मतलब है 100 से अधिक रिपॉजिटरियों में खोज करना। यह रिपॉजिटरी इस समस्या को हल करता है - लोगो यहां मौजूद हैं, और README फ़ाइलें `raw.githubusercontent.com` यूआरएल के माध्यम से उनका संदर्भ देती हैं।

## संरचना

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

संगठन में 117 लोगो मौजूद हैं। PNG फ़ाइलें PNG ही रहेंगी, और JPEG फ़ाइलें JPEG ही रहेंगी। फ़ॉर्मेट एक ब्रांड संबंधी निर्णय है, न कि बिल्ड लक्ष्य।

## कमांड-लाइन इंटरफेस (CLI)

```bash
npm install -g @mcptoolshop/brand

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

सुरक्षा नीति के लिए [SECURITY.md](SECURITY.md) देखें, और माइग्रेशन गाइड के लिए [docs/handbook.md](docs/handbook.md) देखें।

## गोपनीयता

यह टूल कोई भी डेटा एकत्र नहीं करता है। सभी कार्य केवल स्थानीय फ़ाइल सिस्टम पर किए जाते हैं।

## स्कोरकार्ड

| श्रेणी | स्कोर | टिप्पणियाँ |
|----------|-------|-------|
| A. सुरक्षा | 10/10 | SECURITY.md, SHA-256 अखंडता, कोई नेटवर्क नहीं, कोई डेटा संग्रह नहीं। |
| B. त्रुटि प्रबंधन | 8/10 | संरचित त्रुटियां, स्पष्ट कमांड-लाइन आउटपुट, एग्जिट कोड। |
| C. ऑपरेटर दस्तावेज़ | 10/10 | README, CHANGELOG, हैंडबुक, पूर्ण कमांड-लाइन दस्तावेज़। |
| D. वितरण स्वच्छता | 9/10 | CI अखंडता जांच, 29 परीक्षण, संस्करण संरेखित। |
| E. पहचान | 10/10 | लोगो, अनुवाद, लैंडिंग पृष्ठ, मेटाडेटा। |
| **Total** | **47/50** | |

## लाइसेंस

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
