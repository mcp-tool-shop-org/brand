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

## क्यों

जब प्रत्येक रिपॉजिटरी लोगो की अपनी प्रति रखती है, तो आपको दोहराव, विचलन और असंगति मिलती है। एक रीब्रांड का मतलब है 100+ रिपॉजिटरी में खोजना। यह रिपॉजिटरी इसे ठीक करता है - लोगो यहां मौजूद हैं, रीडमी फ़ाइलें `raw.githubusercontent.com` यूआरएल के माध्यम से उनका संदर्भ देती हैं।

## संरचना

```
logos/
  <slug>/
    readme.png       # THE logo — one canonical image, format preserved as-is
    gallery/          # optional — a named collection of N extra showcase images
      side.png
      back.png
manifest.json     # SHA-256 integrity hashes for every asset, tagged role: primary | gallery
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

संगठन में सैकड़ों लोगो। पीएनजी फाइलें पीएनजी ही रहेंगी। जेपीईजी फाइलें जेपीईजी ही रहेंगी। प्रारूप एक ब्रांड निर्णय है, न कि एक बिल्ड लक्ष्य।

एक स्लग की `readme.<ext>` हमेशा एकमात्र आधिकारिक लोगो होती है। एक स्लग में अतिरिक्त प्रदर्शन छवियों (एक स्प्राइट पैक के चरित्र टर्नअराउंड, एक उपकरण का स्क्रीनशॉट सेट) का एक उपफ़ोल्डर भी हो सकता है - मैनिफेस्ट प्रत्येक संपत्ति के `role` को स्पष्ट रूप से टैग करता है, बजाय इसके कि हर छवि फ़ाइल को समान तरीके से माना जाए। नीचे [गैलरी और डायनामिक रीडमी](#galleries--dynamic-readmes) देखें।

## सीएलआई

```bash
npm install -g @mcptoolshop/brand

# Verify all logos match their manifest hashes
brand verify

# Regenerate manifest after adding/replacing a logo
brand manifest

# CI mode — fail if manifest is out of date
brand manifest --check

# Show registry summary — counts, formats, sync status
brand stats
brand stats --json

# Audit repos for broken refs, badge collisions, indentation traps
brand audit --repos /path/to/clones

# Migrate READMEs to point at brand repo (dry run first)
brand migrate --repos /path/to/clones --dry-run
brand migrate --repos /path/to/clones

# Register a directory of images as a named gallery for a slug
brand add-gallery <slug> /path/to/turnarounds --dry-run
brand add-gallery <slug> /path/to/turnarounds

# Sync a consuming repo's README gallery block from the manifest
brand sync --slug <slug> --repos /path/to/clones --check
brand sync --slug <slug> --repos /path/to/clones
```

## ऑटो-सिंक

एक दैनिक गिटहब एक्शन (`sync.yml`) संगठन में प्रत्येक रिपॉजिटरी को लोगो के लिए स्कैन करता है, नई या बदली हुई संपत्तियों को डाउनलोड करता है, मैनिफेस्ट को पुन: उत्पन्न करता है और एक पीआर खोलता है। आप इसे `workflow_dispatch` के माध्यम से मैन्युअल रूप से भी ट्रिगर कर सकते हैं।

सिंक स्क्रिप्ट `scripts/sync-org-logos.sh` पर मौजूद है और इसे स्थानीय रूप से चलाया जा सकता है:

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### सेटअप (एक बार, प्रति फोर्क)

सिंक वर्कफ़्लो एक पीआर खोलता है, इसलिए इसके लिए ऐसा करने की अनुमति की आवश्यकता होती है। रिपॉजिटरी सेटिंग्स में इनमें से किसी एक को चुनें:

1. **एक्शन पीआर निर्माण सक्षम करें।** सेटिंग्स -> एक्शन -> सामान्य -> "गिटहब एक्शन को पुल अनुरोध बनाने और अनुमोदित करने की अनुमति दें" -> चालू। सबसे सरल तरीका; प्रबंधित करने के लिए कोई अतिरिक्त रहस्य नहीं। ([गिटहब दस्तावेज़](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **एक `SYNC_PAT` रिपॉजिटरी रहस्य प्रदान करें।** `contents:write` + `pull-requests:write` स्कोप के साथ व्यक्तिगत एक्सेस टोकन। यह तरीका ऑटो-पीआर पर डाउनस्ट्रीम सीआई को भी ट्रिगर करता है (डिफ़ॉल्ट `GITHUB_TOKEN` ऐसा नहीं करता)।

इनमें से किसी एक के बिना, दैनिक वर्कफ़्लो हर सुबह `gh pr create` पर अनुमति त्रुटि के साथ विफल हो जाता है।

### समस्या निवारण

| लक्षण | कारण | समाधान |
| --- | --- | --- |
| `gh pr create` 403 | ऊपर दिए गए सेटअप विकल्पों में से कोई भी कॉन्फ़िगर नहीं है | ऊपर विकल्प 1 या 2 चुनें |
| दैनिक वर्कफ़्लो कोई पीआर नहीं खोलता, कुछ भी नहीं बदलता | सभी संगठन रिपॉजिटरी में या तो कोई लोगो नहीं है, या लोगो पहले से ही मेल खाते हैं | अपेक्षित - नो-ऑप रन स्वस्थ हैं |
| मैनिफेस्ट सत्यापन विफल रहा | लोगो डाउनलोड किए गए लेकिन मैनिफेस्ट हैश बेमेल | एक `sync-failure` मुद्दा स्वचालित रूप से बनाया गया है; स्थानीय रूप से `brand manifest && brand verify` को फिर से चलाएं |
| एक सिंक पीआर एक खराब लोगो पेश करता है | अपस्ट्रीम रिपॉजिटरी ने दूषित या गलत-सामग्री वाली छवि प्रकाशित की | विलय को पूर्ववत करें: `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`। [सुरक्षा.एमडी](SECURITY.md#incident-response) देखें |

## गैलरी और डायनामिक रीडमी

कुछ उत्पादों को प्रति स्लग से अधिक एक प्रदर्शन छवि की आवश्यकता होती है - एक स्प्राइट पैक के 8-दिशात्मक चरित्र टर्नअराउंड, एक उपकरण का स्क्रीनशॉट सेट। `brand` इन्हें एक प्रथम श्रेणी की **गैलरी** के रूप में मानता है, जो कि एकमात्र आधिकारिक लोगो से अलग है, बजाय अतिरिक्त फ़ाइलों के एक अनाम ढेर के:

```bash
# Register a directory of images as a gallery (idempotent — re-run any time
# source-dir changes; new files are added, changed files updated, deleted
# files removed. Regenerates manifest.json automatically.)
brand add-gallery pirate-raiders-3d-2 /path/to/turnarounds
```

उस गैलरी को **उपभोक्ता रिपॉजिटरी की रीडमी** में प्रस्तुत करने और जैसे-जैसे गैलरी बदलती है, उसे सिंक में रखने के लिए, रीडमी में कहीं भी एक मार्कर जोड़ी छोड़ें:

```html
<!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
<!-- brand:gallery:end -->
```

फिर चलाएं:

```bash
brand sync --slug pirate-raiders-3d-2 --repos /path/to/clones
```

`sync` मैनिफेस्ट से मार्करों के बीच सब कुछ पुन: उत्पन्न करता है - प्रत्येक रन पर अपरिवर्तनीय, बाइट-समान आउटपुट जिसमें अपरिवर्तित इनपुट होते हैं, इसलिए यह सीआई के साथ साफ रूप से जुड़ता है। `--check` लिखने के बिना विचलन की रिपोर्ट करता है (यदि रीडमी पुरानी है तो 1 से बाहर निकलें, यदि वर्तमान है तो 0) - इसे उसी तरह एक उपभोक्ता रिपॉजिटरी के सीआई में वायर करें जैसे `brand manifest --check` इस पर रोक लगाता है। यह एक **डायनामिक रीडमी** अनुभाग है: मार्करों के आसपास हाथ से लिखी सामग्री को अपरिवर्तित रखा जाता है; उनके बीच सब कुछ मशीन-स्वामित्व वाला होता है और किसी भी समय पुन: उत्पन्न करने के लिए सुरक्षित होता है। `brand:gallery:` उपसर्ग नामस्थानित है ताकि भविष्य में ब्लॉक प्रकार (बैज, आँकड़े) टकराव के बिना एक रीडमी साझा कर सकें।

`brand audit` अंतर को भी समझता है - एक रीडमी जिसमें एक स्लग के लिए कई गैलरी `<img>` टैग हैं, अब संभावित बैज टकराव के रूप में चिह्नित नहीं किया गया है; यदि यह अभी तक मार्कर ब्लॉक से जुड़ा नहीं है, तो `audit` इसके बजाय `brand sync` की ओर इशारा करता है।

## मैन्युअल रूप से लोगो जोड़ना

1. फ़ाइल को `logos/<slug>/readme.png` (या `.jpg`) में छोड़ें
2. अखंडता हैश को अपडेट करने के लिए `brand manifest` चलाएं
3. लोगो और `manifest.json` दोनों को एक साथ कमिट करें
4. सीआई पुश पर मैनिफेस्ट को सत्यापित करता है

## सुरक्षा

| पहलू | विवरण |
|--------|--------|
| **Data touched** | `logos/` में लोगो और गैलरी छवि फ़ाइलें (पढ़ें), `manifest.json` (पढ़ें/लिखें), रीडमी फ़ाइलें (माइग्रेशन और सिंक के दौरान पढ़ें/लिखें - `sync` हमेशा केवल `brand:gallery:start`/`end` मार्करों के बीच सामग्री को फिर से लिखता है) |
| **Data NOT touched** | कोई टेलीमेट्री, कोई एनालिटिक्स, कोई नेटवर्क कॉल नहीं (जिसमें `sync` भी शामिल है - यह स्थानीय मैनिफेस्ट + स्थानीय रीडमी का एक शुद्ध फ़ंक्शन है), लोगो/गैलरी फ़ाइलों से कोई कोड निष्पादन नहीं |
| **Permissions** | पढ़ें: लोगो/गैलरी फ़ाइलें, मैनिफेस्ट, रीडमी। लिखें: manifest.json, रीडमी (केवल माइग्रेट/सिंक) |
| **Network** | कोई नहीं - पूरी तरह से ऑफ़लाइन सीएलआई टूल |
| **Telemetry** | कोई भी एकत्र या भेजा नहीं गया |

प्रत्येक लोगो को `manifest.json` में SHA-256 हैश द्वारा ट्रैक किया जाता है। सीआई हर पुश पर `brand manifest --check` चलाता है जो `logos/` या `manifest.json` को छूता है। कोई भी बेमेल - आकस्मिक अधिलेखन, छेड़छाड़, विचलन - निर्माण विफल हो जाता है। केवल छवि फ़ाइलों (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`) को ट्रैक किया जाता है; `logos/` के तहत गैर-छवि फ़ाइलों को अनदेखा कर दिया जाता है।

सुरक्षा संबंधी रिपोर्ट GitHub के [निजी सलाहकार चैनल](https://github.com/mcp-tool-shop-org/brand/security/advisories/new) पर भेजी जाती हैं। पूरी नीति के लिए [SECURITY.md](SECURITY.md) और माइग्रेशन हैंडबुक के लिए [docs/handbook.md](docs/handbook.md) देखें।

## स्कोरकार्ड

| श्रेणी | अंक |
|----------|-------|
| ए. सुरक्षा | 10 |
| बी. त्रुटि प्रबंधन | 10 |
| सी. ऑपरेटर दस्तावेज़ | 10 |
| डी. शिपिंग स्वच्छता | 10 |
| ई. पहचान (सॉफ्ट) | 10 |
| **Overall** | **50/50** |

प्रत्येक डी पंक्ति हरी है — नोड 20/22/24 मैट्रिक्स, SHA-पिन्ड क्रियाएं, `npm audit` चरण, डिपेंडबॉट, टारबॉल सामग्री और पूर्ण टैग/रिलीज़/एनपीएम समानता (2026-07-01 को हल किया गया — v1.0.2/v1.0.3 कभी भी npm तक नहीं पहुंचा; गिट/चेंजलॉग समानता के लिए पिछली तारीख में टैग किया गया)।

> पूर्ण ऑडिट: [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## लाइसेंस

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
