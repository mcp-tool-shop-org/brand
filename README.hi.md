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

जब प्रत्येक रिपॉजिटरी में लोगो की अपनी अलग कॉपी होती है, तो इससे दोहराव, विचलन और असंगति होती है। किसी ब्रांड को बदलने का मतलब है 100 से अधिक रिपॉजिटरियों में खोज करना। यह रिपॉजिटरी इस समस्या को हल करता है - यहां लोगो मौजूद हैं, और README फ़ाइलें `raw.githubusercontent.com` यूआरएल के माध्यम से उनका उल्लेख करती हैं।

## संरचना।

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

संगठन में मौजूद सैकड़ों लोगो एक ही तरह के रहेंगे। पीएनजी फाइलें पीएनजी ही रहेंगी, और जेपीईजी फाइलें जेपीईजी ही रहेंगी। फ़ॉर्मेट एक ब्रांड संबंधी निर्णय है, न कि किसी तकनीकी आवश्यकता।

## सीएलआई (CLI)

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
```

## स्वचालित सिंक्रोनाइज़ेशन

एक दैनिक गिटहब एक्शन (`sync.yml`) संगठन (ऑर्ग) में मौजूद प्रत्येक रिपॉजिटरी में लोगो की खोज करता है, नए या बदले हुए फ़ाइलों को डाउनलोड करता है, मैनिफेस्ट को फिर से बनाता है, और एक पुल रिक्वेस्ट (पीआर) खोलता है। आप इसे `workflow_dispatch` के माध्यम से मैन्युअल रूप से भी शुरू कर सकते हैं।

सिंक्रोनाइज़ेशन स्क्रिप्ट `scripts/sync-org-logos.sh` पर स्थित है और इसे स्थानीय रूप से चलाया जा सकता है:

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### स्थापना (एक बार, प्रत्येक शाखा के लिए)।

सिंक वर्कफ़्लो एक पुल रिक्वेस्ट (Pull Request) खोलता है, इसलिए इसके लिए ऐसा करने की अनुमति की आवश्यकता होती है। रिपॉजिटरी (Repository) की सेटिंग्स में से किसी एक विकल्प को चुनें:

1. **एक्शन पीआर (Pull Request) बनाने की अनुमति सक्षम करें।** सेटिंग्स -> एक्शन -> सामान्य -> "गिटहब एक्शन को पुल रिक्वेस्ट बनाने और स्वीकृत करने की अनुमति दें" -> चालू करें। यह सबसे सरल तरीका है; इसमें प्रबंधित करने के लिए कोई अतिरिक्त गुप्त जानकारी (सीक्रेट) नहीं है। ([गिटहब दस्तावेज़](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **एक `SYNC_PAT` रिपॉजिटरी सीक्रेट प्रदान करें।** एक व्यक्तिगत एक्सेस टोकन जिसमें `contents:write` और `pull-requests:write` अनुमतियाँ हों। यह तरीका ऑटो-पीआर (स्वचालित पुल रिक्वेस्ट) के लिए डाउनस्ट्रीम सीआई (निरंतर एकीकरण) को भी सक्रिय करता है (डिफ़ॉल्ट `GITHUB_TOKEN` ऐसा नहीं करता है)।

इनमें से किसी एक घटक के बिना, हर सुबह `gh pr create` कमांड निष्पादित करने पर दैनिक कार्यप्रवाह विफल हो जाता है और एक अनुमति संबंधी त्रुटि उत्पन्न होती है।

### समस्या निवारण।

| लक्षण। | कारण। | ठीक करें। |
| --- | --- | --- |
| `gh pr create` 403 (यह एक त्रुटि संदेश प्रतीत होता है, जिसका अर्थ हो सकता है कि "gh" नामक किसी चीज़ को बनाने में समस्या आ रही है और त्रुटि कोड 403 है।) | ऊपर दिए गए किसी भी कॉन्फ़िगरेशन विकल्प को सेट नहीं किया गया है। | ऊपर दिए गए विकल्पों में से 1 या 2 को चुनें। |
| रोजाना की कार्यप्रणाली में, कोई भी पुल अनुरोध (Pull Request) नहीं खोला जाता है, और कोई भी बदलाव नहीं किया जाता है। | सभी संगठन संबंधी रिपॉजिटरी या तो बिना किसी लोगो के हैं, या उनमें मौजूद लोगो पहले से ही उपयुक्त हैं। | अपेक्षित है कि "नो-ऑप" (कोई कार्रवाई नहीं) रन सामान्य हों। |
| मैनिफेस्ट सत्यापन विफल हो गया। | लोगो डाउनलोड हो गए हैं, लेकिन मैनिफेस्ट हैश में अंतर है। | एक "सिंक-विफलता" (sync-failure) संबंधी समस्या स्वचालित रूप से उत्पन्न हो गई है; कृपया "ब्रांड मैनिफेस्ट" (brand manifest) और "ब्रांड सत्यापित" (brand verify) कमांड को स्थानीय रूप से फिर से चलाएं। |
| एक सिंक्रोनाइज़ेशन प्रक्रिया एक खराब लोगो को पेश कर सकती है। | "अपस्ट्रीम रिपॉजिटरी ने एक दूषित या गलत सामग्री वाली इमेज प्रकाशित की।" | मर्ज को पूर्ववत करें: `git revert <मर्ज-शा> && ब्रांड मैनिफेस्ट && git commit --amend --no-edit && git push`. विवरण के लिए [SECURITY.md](SECURITY.md#incident-response) देखें। |

## मैन्युअल रूप से लोगो जोड़ना।

1. फ़ाइल को `logos/<slug>/readme.png` (या `.jpg`) में डालें।
2. "ब्रांड मैनिफेस्ट" चलाकर इंटीग्रिटी हैश को अपडेट करें।
3. लोगो और `manifest.json` दोनों को एक साथ कमिट करें।
4. सीआई (CI) पुश करने पर मैनिफेस्ट को सत्यापित करता है।

## सुरक्षा।

| पहलू/अंश/दृष्टिकोण. | विवरण। |
|--------|--------|
| **Data touched** | `logos/` फ़ोल्डर में मौजूद लोगो फ़ाइलें (केवल पढ़ने के लिए), `manifest.json` फ़ाइल (पढ़ने और लिखने दोनों के लिए), और README फ़ाइलें (माइग्रेशन के दौरान पढ़ने और लिखने के लिए)। |
| **Data NOT touched** | कोई भी डेटा संग्रह नहीं, कोई भी विश्लेषण नहीं, कोई भी नेटवर्क कनेक्शन नहीं, और लोगो फ़ाइलों से कोई भी कोड निष्पादन नहीं। |
| **Permissions** | पढ़ें: लोगो फ़ाइलें, मैनिफेस्ट, README फ़ाइलें। लिखें: manifest.json, README फ़ाइलें (केवल माइग्रेशन के लिए)। |
| **Network** | कोई भी आवश्यकता नहीं - यह एक पूरी तरह से ऑफलाइन कमांड-लाइन टूल है। |
| **Telemetry** | कोई भी जानकारी एकत्र नहीं की गई या भेजी गई। |

प्रत्येक लोगो को `manifest.json` फ़ाइल में SHA-256 हैश के माध्यम से ट्रैक किया जाता है। CI (निरंतर एकीकरण) सिस्टम, `logos/` या `manifest.json` फ़ाइलों में किसी भी बदलाव के साथ, `brand manifest --check` कमांड चलाता है। यदि कोई भी विसंगति पाई जाती है—चाहे वह अनजाने में हुई हो, छेड़छाड़ का परिणाम हो, या किसी अन्य कारण से—तो बिल्ड विफल हो जाता है। केवल छवि फ़ाइलें (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`) ही ट्रैक की जाती हैं; `logos/` फ़ोल्डर के अंतर्गत मौजूद अन्य फ़ाइलें अनदेखी की जाती हैं।

सुरक्षा संबंधी रिपोर्टें GitHub के [निजी सलाह चैनल](https://github.com/mcp-tool-shop-org/brand/security/advisories/new) पर भेजी जाती हैं। पूर्ण नीति के लिए [SECURITY.md](SECURITY.md) देखें और माइग्रेशन हैंडबुक के लिए [docs/handbook.md](docs/handbook.md) देखें।

## स्कोरकार्ड

| श्रेणी | स्कोर |
|----------|-------|
| ए. सुरक्षा | 10 |
| बी. त्रुटि प्रबंधन | 10 |
| सी. ऑपरेटर दस्तावेज़ | 10 |
| डी. शिपिंग स्वच्छता | 9 |
| ई. पहचान (सॉफ्ट) | 10 |
| **Overall** | **49/50** |

डी का स्कोर 9/10 है, लेकिन एक अनुवर्ती कार्रवाई बाकी है: रिमोट गिट टैग केवल v1.0.1 तक ही उपलब्ध हैं, लेकिन CHANGELOG में v1.0.2 + v1.0.3 प्रकाशित किए गए हैं। अन्य सभी 'डी' श्रेणी की लाइनें हरी हैं - Node 18/20/22 का समर्थन, SHA-पिन किए गए क्रियाएं, `npm audit` चरण, Dependabot, टारबॉल सामग्री।

> पूर्ण ऑडिट: [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## लाइसेंस

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
