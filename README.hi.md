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

जब हर रिपॉजिटरी में लोगो की अपनी-अपनी प्रति होती है, तो इससे दोहराव, विचलन और असंगति पैदा होती है। रीब्रांडिंग का मतलब है कि आपको 100 से अधिक रिपॉजिटरियों में खोजना होगा। यह रिपॉजिटरी उस समस्या को हल करता है—लोगो यहीं संग्रहीत हैं, और रीडमी फ़ाइलें उन्हें `raw.githubusercontent.com` यूआरएल के माध्यम से संदर्भित करती हैं।

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

संगठन में सैकड़ों लोगो हैं। पीएनजी फाइलें पीएनजी ही रहेंगी। जेपीईजी फाइलें जेपीईजी ही रहेंगी। यह प्रारूप एक ब्रांड निर्णय है, न कि निर्माण का लक्ष्य।

एक स्लग का `readme.<ext>` हमेशा एक ही आधिकारिक लोगो होता है। स्लग में अतिरिक्त प्रदर्शन छवियों की एक उपफ़ोल्डर भी हो सकती है (जैसे कि एक स्प्राइट पैक के पात्रों के विभिन्न दृश्य, या किसी उपकरण के स्क्रीनशॉट)। मैनिफेस्ट टैग प्रत्येक संपत्ति के `role` को स्पष्ट रूप से इंगित करता है, बजाय इसके कि हर छवि फ़ाइल को समान तरीके से माना जाए। नीचे [गैलरी और गतिशील रीडमी](#गैलरी--गतिशील-रीडमी) देखें।

## कमांड लाइन इंटरफेस

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

# Audit against the live org without cloning anything, and reconcile the
# registry against it — reports renamed, archived, and orphaned slugs.
# Opt-in network access; needs GH_TOKEN or GITHUB_TOKEN.
brand audit --remote --org mcp-tool-shop-org

# Show a slug's asset history from git — added/changed/removed, with hashes
brand history <slug>
brand history <slug> --limit 5 --json

# Remove a slug (or just one of its galleries). Destructive, so --yes is
# required; --dry-run shows exactly what would go first.
brand remove <slug> --dry-run
brand remove <slug> --yes
brand remove <slug> --gallery turnarounds --yes

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

## स्वचालित रूप से सिंक्रनाइज़ करें।

एक दैनिक गिटहब एक्शन (`sync.yml`) संगठन में मौजूद प्रत्येक रिपॉजिटरी को स्कैन करता है, नए या संशोधित एसेट्स डाउनलोड करता है, मैनिफ़ेस्ट को फिर से बनाता है और एक पुल रिक्वेस्ट खोलता है। आप इसे `workflow_dispatch` के माध्यम से मैन्युअल रूप से भी ट्रिगर कर सकते हैं।

सिंक स्क्रिप्ट `scripts/sync-org-logos.sh` पर स्थित है और इसे स्थानीय रूप से चलाया जा सकता है:

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### प्रारंभिक सेटअप (एक बार, प्रत्येक शाखा के लिए)

सिंक वर्कफ़्लो एक पुल रिक्वेस्ट खोलता है, इसलिए इसे ऐसा करने की अनुमति की आवश्यकता होती है। रिपॉजिटरी सेटिंग्स में इनमें से कोई एक विकल्प चुनें:

1. **एक्शन पीआर निर्माण को सक्षम करें।** सेटिंग्स -> एक्शन -> सामान्य -> "गिटहब एक्शन को पुल अनुरोध बनाने और अनुमोदित करने की अनुमति दें" -> चालू करें। सबसे सरल तरीका; प्रबंधित करने के लिए कोई अतिरिक्त गुप्त जानकारी नहीं। ([गिटहब दस्तावेज़](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **एक `SYNC_PAT` रिपॉजिटरी गुप्त जानकारी प्रदान करें।** `contents:write` + `pull-requests:write` स्कोप के साथ व्यक्तिगत एक्सेस टोकन। यह तरीका स्वचालित पीआर पर डाउनस्ट्रीम सीआई को भी ट्रिगर करता है (डिफ़ॉल्ट `GITHUB_TOKEN` ऐसा नहीं करता)।

इनमें से किसी एक के बिना, दैनिक कार्यप्रवाह हर सुबह `gh pr create` बजे अनुमति संबंधी त्रुटि के कारण विफल हो जाता है।

### समस्या निवारण

| लक्षण | कारण | ठीक करें। |
| --- | --- | --- |
| `gh pr create` 403 | ऊपर दिए गए दोनों विकल्पों में से कोई भी विकल्प सेट नहीं किया गया है। | ऊपर दिए गए विकल्प 1 या 2 में से किसी एक को चुनें। |
| दैनिक कार्यप्रवाह में कोई भी पुल रिक्वेस्ट नहीं खुलता, और कुछ भी नहीं बदलता। | सभी संगठनात्मक रिपॉजिटरी में या तो कोई लोगो नहीं है, या उनके मौजूदा लोगो पहले से ही समान हैं। | अपेक्षित – कोई भी कार्रवाई न करने वाले परीक्षण सफलतापूर्वक चलेंगे। |
| मैनिफेस्ट सत्यापन विफल रहा। | लोगो डाउनलोड हो गए, लेकिन मैनिफ़ेस्ट हैश मेल नहीं खा रहा। | एक `sync-failure` समस्या स्वचालित रूप से बनाई जाती है; `brand manifest && brand verify` को स्थानीय रूप से फिर से चलाएँ। |
| एक सिंक्रोनाइज़्ड पुल अनुरोध एक खराब लोगो पेश करता है। | अपस्ट्रीम रिपॉजिटरी ने दूषित या गलत सामग्री वाली छवि प्रकाशित की। | विलय को पूर्ववत करें: `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`। [सुरक्षा.एमडी](सुरक्षा.एमडी#घटना-प्रतिक्रिया) देखें। |

## गैलरी और गतिशील रीडमी फ़ाइलें।

कुछ उत्पादों को प्रत्येक स्लग के लिए एक से अधिक शोकेस छवियों की आवश्यकता होती है—जैसे कि किसी स्प्राइट पैक में आठ दिशाओं में घूमते हुए पात्रों का प्रदर्शन, या किसी उपकरण के स्क्रीनशॉट का सेट। `brand` इन्हें एक उच्च-स्तरीय **गैलरी** के रूप में मानता है, जो एकल आधिकारिक लोगो से अलग है, बजाय अतिरिक्त फ़ाइलों के ढेर के:

```bash
# Register a directory of images as a gallery (idempotent — re-run any time
# source-dir changes; new files are added, changed files updated, deleted
# files removed. Regenerates manifest.json automatically.)
brand add-gallery pirate-raiders-3d-2 /path/to/turnarounds
```

उस गैलरी को एक ऐसे भंडार (रिपॉजिटरी) के रीडमी में शामिल करने और गैलरी में बदलाव होने पर उसे अद्यतित रखने के लिए, रीडमी में कहीं भी मार्कर की जोड़ी जोड़ें:

```html
<!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
<!-- brand:gallery:end -->
```

इसके बाद यह कमांड चलाएँ:

```bash
brand sync --slug pirate-raiders-3d-2 --repos /path/to/clones
```

`sync` मैनिफ़ेस्ट से मार्करों के बीच की हर चीज़ को पुन: उत्पन्न करता है — प्रत्येक रन पर अपरिवर्तित इनपुट के साथ नियतात्मक, बाइट-समान आउटपुट, इसलिए यह CI के साथ आसानी से एकीकृत हो जाता है। `--check` बिना कुछ लिखे बदलावों की रिपोर्ट करता है (यदि README पुराना है तो त्रुटि कोड 1, यदि वर्तमान है तो 0) — इसे उसी तरह एक उपभोग करने वाले रिपॉजिटरी के CI में जोड़ें जिस तरह `brand manifest --check` इस प्रक्रिया को नियंत्रित करता है। यह एक **गतिशील README** अनुभाग है: मार्करों के आसपास की हस्तलिखित सामग्री अपरिवर्तित रहती है; उनके बीच की हर चीज़ मशीन द्वारा प्रबंधित होती है और किसी भी समय पुन: उत्पन्न करने के लिए सुरक्षित है। `brand:gallery:` उपसर्ग को नामस्थान दिया गया है ताकि भविष्य में ब्लॉक प्रकार (बैज, आँकड़े) बिना टकराव के एक ही README साझा कर सकें।

`brand audit` अंतर को भी समझता है—एक ही स्लग के लिए कई गैलरी `<img>` टैग वाली एक रीडमी फ़ाइल अब संभावित बैज टकराव के रूप में चिह्नित नहीं की जाएगी; यदि इसे अभी तक किसी मार्कर ब्लॉक से जोड़ा नहीं गया है, तो `audit` इसके बजाय `brand sync` की ओर इशारा करता है।

## मैन्युअल रूप से लोगो जोड़ना।

1. फ़ाइल को `logos/<slug>/readme.png` (या `.jpg`) में डालें।
2. इंटीग्रिटी हैश को अपडेट करने के लिए `brand manifest` चलाएँ।
3. लोगो और `manifest.json` दोनों को एक साथ कमिट करें।
4. सीआई पुश पर मैनिफ़ेस्ट की जाँच करता है।

## सुरक्षा

| पहलू/विशिष्टता/दृष्टिकोण | विस्तार से बताएं। / विवरण। |
|--------|--------|
| **Data touched** | `logos/` में लोगो और गैलरी छवि फ़ाइलें (पढ़ें), `manifest.json` (पढ़ें/लिखें), रीडमी फ़ाइलें (स्थानांतरण और सिंक्रनाइज़ेशन के दौरान पढ़ें/लिखें — `sync` केवल `brand:gallery:start`/`end` मार्करों के बीच सामग्री को फिर से लिखता है)। |
| **Data NOT touched** | कोई टेलीमेट्री नहीं, कोई विश्लेषण नहीं, और लोगो/गैलरी फ़ाइलों से कोई कोड निष्पादन नहीं। |
| **Permissions** | पढ़ें: लोगो/गैलरी फ़ाइलें, मेनिफ़ेस्ट, रीडमी। लिखें: मेनिफ़ेस्ट.json, रीडमी (केवल माइग्रेट/सिंक करें), और `logos/<slug>/` (केवल `remove`, जिसके लिए `--yes` की आवश्यकता होती है)। |
| **Network** | डिफ़ॉल्ट रूप से कोई भी नहीं। `brand audit --remote` एकमात्र अपवाद है और यह पूरी तरह से वैकल्पिक है—यदि उस फ़्लैग का उपयोग नहीं किया जाता है, तो कोई नेटवर्क अनुरोध नहीं भेजा जाएगा। `sync`, `verify`, `manifest`, `stats`, `migrate`, `add-gallery`, `remove` और `history` सभी पूरी तरह से ऑफ़लाइन हैं। |
| **Telemetry** | किसी ने भी एकत्र नहीं किया या भेजा। |

प्रत्येक लोगो को `manifest.json` में SHA-256 हैश के माध्यम से ट्रैक किया जाता है। CI हर पुश पर `brand manifest --check` चलाता है जो `logos/` या `manifest.json` को प्रभावित करता है। केवल छवि फ़ाइलों (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`) को ही ट्रैक किया जाता है; `logos/` के अंतर्गत आने वाली गैर-छवि फ़ाइलों को अनदेखा कर दिया जाता है।

**हैश क्या साबित करता है और क्या नहीं।** एक विसंगति आकस्मिक अधिलेखन, दूषित फ़ाइल या डिस्क और मैनिफ़ेस्ट के बीच विचलन को पकड़ती है — ये रोज़मर्रा की विफलताएँ हैं। यह जानबूझकर किए गए छेड़छाड़ को **नहीं** रोकता: जिसके पास लिखने का अधिकार है, वह कोई भी लोगो बदल सकता है, `brand manifest` चला सकता है और दोनों को लागू कर सकता है, जिसके बाद `verify` सफल हो जाता है। हैश साबित करता है कि ट्री आंतरिक रूप से सुसंगत है, न कि इसकी सामग्री स्वीकृत की गई थी। वास्तव में जो इस अंतर को दूर करता है वह रिपॉजिटरी नियंत्रण के साथ-साथ दैनिक सिंक्रनाइज़ेशन का विचलन ट्रिपवायर है, जो प्रत्येक रजिस्ट्री लोगो की उसकी अपस्ट्रीम रिपो के साथ क्रॉस-चेक करता है — [SECURITY.md](SECURITY.md#the-limit-of-the-manifest--read-this-before-trusting-it) और [`.github/SECURITY-CONTROLS.md`](.github/SECURITY-CONTROLS.md) देखें।

सुरक्षा रिपोर्ट GitHub के [निजी सलाहकार चैनल](https://github.com/mcp-tool-shop-org/brand/security/advisories/new) पर जाती हैं। पूरी नीति के लिए [SECURITY.md](SECURITY.md) और माइग्रेशन हैंडबुक के लिए [docs/handbook.md](docs/handbook.md) देखें।

## स्कोरकार्ड

| श्रेणी | अंक |
|----------|-------|
| ए. सुरक्षा | 10 |
| बी. त्रुटि प्रबंधन | 10 |
| सी. ऑपरेटर दस्तावेज़ | 10 |
| डी. शिपिंग स्वच्छता | 10 |
| ई. पहचान (सॉफ्ट) | 10 |
| **Overall** | **50/50** |

प्रत्येक डी लाइन हरी है — नोड 20/22/24 मैट्रिक्स, SHA-पिन्ड क्रियाएं, `npm audit` चरण, डिपेंडबॉट, टारबॉल सामग्री और पूर्ण टैग/रिलीज़/एनपीएम समानता (2026-07-01 को हल किया गया — v1.0.2/v1.0.3 कभी भी npm तक नहीं पहुंचा; git/CHANGELOG समानता के लिए पिछली तारीख में टैग किया गया)।

> पूर्ण ऑडिट: [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## लाइसेंस

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
