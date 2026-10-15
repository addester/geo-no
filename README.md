<p align="center"><img src="extension/icons/icon128.png" width="88" alt="Geo No logo"></p>

<h1 align="center">Geo No: Block YouTube Shorts &amp; Instagram Reels by Country</h1>

<p align="center"><b>A free, open-source Chrome extension that hides or skips YouTube Shorts and Instagram Reels from countries you choose not to watch.</b><br>
Tired of your Shorts or Reels feed being full of content from one country? Pick the country and Geo No filters it out as you scroll.</p>

<p align="center">
  <a href="https://github.com/addester/geo-no/releases/latest"><b>⬇ Download</b></a> ·
  <a href="https://addester.github.io/geo-no/">Website</a> ·
  <a href="#install-2-minutes">Install guide</a> ·
  <a href="#how-it-decides-where-a-short-or-reel-is-from">How it works</a> ·
  <a href="docs/privacy.html">Privacy</a>
</p>

<p align="center"><img src="docs/img/blocked.png" width="720" alt="Geo No hiding a YouTube Short from India with options to skip, show anyway, or allow the channel"></p>

---

## What it does

- **YouTube Shorts and Instagram Reels.** Works on youtube.com/shorts and instagram.com/reels. Turn either site on or off in settings.
- **Block content from any country.** For example, block Indian Shorts and Reels if you're in the US, or block content from any of 240+ countries and territories.
- **Skip or blur:** auto-skip to the next Short or Reel, or blur it with *Show anyway* and *Allow this channel* buttons.
- **Works as you scroll:** each Short or Reel is paused for a split second while Geo No checks it, so blocked content never plays.
- **Allow list:** mark a channel or Instagram account as fine and it's never blocked again.
- **Private:** no account, no tracking, no server. Everything stays in your browser.
- Works in **Chrome, Edge, Brave, Arc, Opera** and other Chromium browsers.
- **On your phone:** an [Android app](#on-your-phone) that works inside the real Instagram and YouTube apps, and a [web app](https://addester.github.io/geo-no/app/) for iPhone and Android.

It works like a website blocker or "de-addiction" app, but for **where content comes from** instead of which site it's on.

## Install (2 minutes)

1. **Download** `geo-no-extension.zip` from the [latest release](https://github.com/addester/geo-no/releases/latest) and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped `extension` folder.
5. The settings page opens. Choose the countries you want to block.
6. *(Recommended)* Add a free YouTube API key ([steps below](#get-a-free-youtube-api-key-recommended)).
7. Open YouTube Shorts and scroll.

> Chrome Web Store listing coming soon. It will make installing a one-click job.

<img src="docs/img/settings.png" width="640" alt="Geo No settings: choose countries to block, skip or blur, sensitivity">

## On your phone

**Android app (beta).** Filters Reels and Shorts inside the real Instagram and YouTube apps, entirely on the phone with no network requests.

1. On your phone, download [`geo-no-android.apk`](https://github.com/addester/geo-no/releases/latest/download/geo-no-android.apk) and open it (allow "install unknown apps" for your browser if asked).
2. Open Geo No, pick countries, tap **Open Accessibility settings** and switch Geo No on.
3. On Android 13+, if the switch is greyed out: **App info → ⋮ → Allow restricted settings**, then try again.

It uses Android's accessibility service to read the caption, account name and hashtags on screen, then swipes to the next video or covers it. If it stops recognising the Reels or Shorts screen after an app update, the **Last check** box in the app shows what it saw: paste that into an issue.

**Web app (iPhone and Android).** [addester.github.io/geo-no/app](https://addester.github.io/geo-no/app/) is a YouTube Shorts feed with your blocked countries filtered out. Add a free YouTube API key once, then *Share → Add to Home Screen*. iPhone doesn't allow any app to look inside Instagram or YouTube, so this is the iPhone option (YouTube Shorts only).

## Get a free YouTube API key (recommended)

Without a key, Geo No only sees each Short's **title and channel name**. With a key it also reads the **channel's country, description, tags and spoken language**, which is far more accurate. The key is free and stays in your browser.

1. Open [Google Cloud Console → YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) and click **Enable** (create a project first if asked).
2. Go to [Credentials](https://console.cloud.google.com/apis/credentials) → **Create credentials → API key**. In the *Create API key* form:
   - **Name:** anything, e.g. `geo-no`.
   - **Select API restrictions:** tick **YouTube Data API v3** only. *If it isn't listed, step 1 wasn't done: enable the API, then come back.*
   - **Application restrictions:** leave on **None**. ("Websites" blocks the extension's own requests. Restricting the key to the YouTube API is enough: a leaked key could only use up your free YouTube quota.)
   - Ignore the **"Service account required"** notice. It only applies to Gemini / Agent Platform.
   - Click **Create** and copy the key (starts with `AIza`).
3. In Geo No settings, paste the key and click **Save & test**. You should see **✓ Key works**.

The free quota (10,000 units/day) covers roughly 5,000 Shorts a day.

## How it decides where a Short or Reel is from

There's no "country" label on a video, and the network can't tell either: every Short and Reel comes from the same YouTube or Instagram servers. So Geo No looks at each one as it appears and weighs several clues:

| Signal | Example | Strength |
|---|---|---|
| Channel's declared country *(YouTube API key)* or Instagram business address | `country: IN` | Decisive |
| Tagged location *(Instagram)* | `Marine Drive, Mumbai` | Strong |
| Writing script | Devanagari, Telugu, Tamil, Gujarati, Bengali, Thai, Hangul… | Strong |
| Spoken / default language *(API key)* | `hi`, `ta`, `te`, `mr`, `ko`, `ja`… | Strong |
| Romanised Hindi ("Hinglish") | bhai, yaar, kya, nahi… | Medium |
| Hashtags and place names (caption, bio, audio name) | `#mumbai #desi #bollywood #ipl` | Medium |

On Instagram no API key is needed: Geo No reads the Reel's caption, tagged location, audio name and the account's bio from instagram.com while you browse.

The clues are combined into a 0–1 score and compared with your **sensitivity** (Low 0.85 · Medium 0.70 · High 0.50). If a channel says it's based in another country, the content clues count for half.

Rich language profiles exist for 🇮🇳 India, 🇵🇰 Pakistan, 🇧🇩 Bangladesh, 🇳🇵 Nepal, 🇱🇰 Sri Lanka, 🇹🇭 Thailand, 🇰🇷 South Korea, 🇯🇵 Japan, 🇮🇱 Israel, 🇬🇪 Georgia, 🇦🇲 Armenia, 🇰🇭 Cambodia, 🇱🇦 Laos, 🇲🇲 Myanmar and 🇪🇹 Ethiopia. Every other country is matched by the channel's declared country and `#countryname` hashtags. **Adding a profile for your country is a great first contribution** (see `PROFILES` in [`extension/classifier.js`](extension/classifier.js)).

## Privacy

Geo No has no server and collects nothing. Settings, your API key and the channel cache live in your browser's extension storage. The only network requests go to Google's YouTube Data API (with your own key) and YouTube's public oEmbed endpoint, to read a Short's title and channel, and, on Instagram, to the same read-only instagram.com endpoints the Instagram website itself uses, to read the Reel you're viewing (caption, tagged location, audio, account bio). Full policy: [docs/privacy.html](docs/privacy.html).

## Known limits

- **Browser only.** It works on youtube.com and instagram.com, not in the YouTube or Instagram mobile apps.
- **Instagram:** works on the Reels tab (`instagram.com/reels`) and single Reel pages while you're logged in. Reels inside the home feed aren't checked yet.
- YouTube and Instagram change their page layouts often. If skipping stops working, please [open an issue](https://github.com/addester/geo-no/issues).
- Creators with English-only titles and no declared country can slip through without an API key.

## Roadmap

- [x] YouTube Shorts (Chrome / Edge / Brave)
- [x] Instagram Reels on the web (v0.2)
- [ ] Chrome Web Store and Edge Add-ons listing
- [ ] Instagram Reels in the home feed, and the "Account based in" country
- [ ] Hide Shorts shelves on the YouTube home page and search results
- [x] Android app (Instagram Reels and YouTube Shorts), beta
- [x] Web app for iPhone and Android (YouTube Shorts feed)
- [ ] Shared, opt-in channel→country database

## Contributing

Issues and pull requests are welcome. To work on it:

```bash
git clone https://github.com/addester/geo-no.git
cd geo-no
node tests/classifier.test.js   # detection tests, no dependencies
bash scripts/test-java.sh       # same cases against the Android port (needs a JDK)
```

The Android APK is built by GitHub Actions on every push to `main` (see `.github/workflows/android.yml`); locally run `gradle assembleRelease` in `android/` with the Android SDK installed.

Load the `extension/` folder with **Load unpacked**, then click ↻ on the extension card after each change.

| File | What it does |
|---|---|
| `extension/player-ui.js` | Shared on-page UI: pauses while checking, blur card, toast, skip flow |
| `extension/content.js` | YouTube: watches the Shorts player and reads the page |
| `extension/content-instagram.js` | Instagram: watches Reels, reads caption / location / audio / bio |
| `extension/background.js` | Fetches metadata, caches channels, applies the allow list, counts stats |
| `extension/classifier.js` | Detection logic. Pure JS, testable in Node (copied to `docs/app/` for the web app) |
| `android/` | Android app: `GeoNoService.java` (accessibility service), `Classifier.java` (Java port), `MainActivity.java` (settings) |
| `docs/app/` | Web app (PWA) for iPhone and Android |
| `tests/cases.json` | Detection cases shared by the JS and Java tests |
| `extension/options.*`, `popup.*` | Settings page and toolbar popup |

## License

[MIT](LICENSE) © Aadi Juvekar

<sub>Keywords: block YouTube Shorts by country · hide Indian Shorts · filter YouTube Shorts by country · block content from India on YouTube · country filter for Shorts · YouTube Shorts blocker extension · block Instagram Reels by country · hide Indian Reels · Instagram Reels country filter · remove regional content from YouTube and Instagram feed</sub>
