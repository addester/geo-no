# Chrome Web Store listing: copy and paste

Developer dashboard: https://chrome.google.com/webstore/devconsole (one-time US$5 registration fee).
Upload: `dist/geo-no-store-upload.zip` (run `bash scripts/build.sh`, or take it from the GitHub release).

## Store listing tab

**Name** (from manifest)
Geo No – Shorts Country Filter

**Summary** (max 132 characters)
Block YouTube Shorts from countries you choose. Auto-skip or blur Shorts from India or anywhere else. Private, no account.

**Category**
Productivity *(alternative: Social & Communication)*

**Language**
English

**Description**
```
Geo No skips or hides YouTube Shorts from the countries you choose.

YouTube has no country filter, and every Short comes from the same servers, so normal blockers can't help. Geo No checks each Short as it appears and decides where it's from using:
• the channel's declared country
• the writing script (Devanagari, Tamil, Telugu, Bengali, Thai, Hangul…)
• the spoken language
• romanised Hindi ("Hinglish") words
• hashtags and place names (#mumbai, #desi, #bollywood…)

FEATURES
• Block Shorts from any of 240+ countries and territories, e.g. block Indian YouTube Shorts
• Auto-skip to the next Short, or blur with "Show anyway"
• "Allow this channel" when something is blocked by mistake
• Low / Medium / High sensitivity
• Daily counter of Shorts checked and blocked
• Optional free YouTube API key for much higher accuracy (step-by-step guide built in)

PRIVATE BY DESIGN
No account, no server, no analytics. Settings stay in your browser. The only requests go to YouTube and Google's YouTube Data API.

OPEN SOURCE
MIT licensed: https://github.com/addester/geo-no
Report problems: https://github.com/addester/geo-no/issues
```

**Graphic assets**
- Store icon 128×128: `extension/icons/icon128.png`
- Screenshots 1280×800: `docs/img/blocked.png`, `docs/img/settings.png`, `docs/img/api-key-steps.png`
- Small promo tile 440×280: `store/promo-440x280.png`

**Official URL / Homepage:** https://addester.github.io/geo-no/
**Support URL:** https://github.com/addester/geo-no/issues

## Privacy practices tab

**Single purpose**
Hides or skips YouTube Shorts that come from countries the user has chosen to block.

**Permission justifications**
- `storage`: saves the user's chosen countries, display mode, sensitivity, allowed channels, optional API key, a cache of channel countries and daily counters.
- Host permission `https://www.youtube.com/*`: detects which Short is playing, pauses it while it's checked, and skips or blurs it. Also reads public title/channel data from YouTube's oEmbed endpoint.
- Host permission `https://www.googleapis.com/*`: calls the YouTube Data API v3 with the user's own API key to read the video's language and the channel's declared country.

**Remote code:** No, I am not using remote code.

**Data usage:** tick **none** of the data categories. The extension does not collect or transmit user data to the developer. Then certify all three statements (not sold, not used for unrelated purposes, not used for creditworthiness).

**Privacy policy URL:** https://addester.github.io/geo-no/privacy.html

## Before you submit
- [ ] GitHub Pages is live (Settings → Pages → Branch `main`, folder `/docs`) so the privacy URL works.
- [ ] Version in `extension/manifest.json` is higher than any version already uploaded.
- [ ] Review usually takes 1–7 days. Extensions with broad host permissions may take longer.

## Edge Add-ons (free, same zip)
https://partner.microsoft.com/dashboard/microsoftedge: reuse the same text, images and zip.
