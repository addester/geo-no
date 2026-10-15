/* Shared by popup and options pages. */
const GEONO_DEFAULTS = {
  enabled: true, countries: ['IN'], sensitivity: 'medium', mode: 'skip', apiKey: '',
  allowChannels: [], blockChannels: [], youtube: true, instagram: true,
};

const ISO_CODES = ('AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ ' +
  'CA CD CF CG CH CI CK CL CM CN CO CR CU CV CW CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ ' +
  'MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PR PS PT PW PY QA ' +
  'RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR ' +
  'TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW').split(' ');

// Countries where Geo No also reads language/script/hashtag clues (others rely on the channel's declared country + #countryname).
const RICH_PROFILES = ['IN', 'PK', 'BD', 'NP', 'LK', 'TH', 'KR', 'JP', 'IL', 'GE', 'AM', 'KH', 'LA', 'MM', 'ET'];

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countryName = (c) => { try { return regionNames.of(c); } catch (_) { return c; } };
const flag = (c) => String.fromCodePoint(...[...c].map((ch) => 0x1F1E6 + ch.charCodeAt(0) - 65));

async function loadSettings() { return { ...GEONO_DEFAULTS, ...(await chrome.storage.sync.get(GEONO_DEFAULTS)) }; }
function saveSettings(patch) { return chrome.storage.sync.set(patch); }
