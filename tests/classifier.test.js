const C = require('../extension/classifier.js');
const S = { countries: ['IN'], sensitivity: 'medium' };
const cases = [
  ['declared IN', { title: 'Morning routine', channelCountry: 'IN' }, true],
  ['Hindi title', { title: 'जब मम्मी ने पकड़ लिया 😂 #comedy', channelTitle: 'Funny Boyz' }, true],
  ['Hinglish', { title: 'Bhai ye kya ho gaya yaar 😂 #shorts', channelTitle: 'Rohit Vlogs' }, true],
  ['Telugu', { title: 'అమ్మ చేతి వంట #shorts', channelTitle: 'x' }, true],
  ['India hashtags', { title: 'Street food tour #mumbai #streetfood #indianfood', channelTitle: 'Foodie' }, true],
  ['audio hi (api)', { title: 'Wait for it', audioLanguage: 'hi', channelTitle: 'abc' }, true],
  ['US english', { title: 'Trying the new McDonalds burger #shorts', channelTitle: 'Mike Eats' }, false],
  ['US declared, english', { title: 'Gym fail lol', channelCountry: 'US' }, false],
  ['English India word in sentence', { title: 'I tried Indian food for the first time', channelTitle: 'Jake', channelCountry: 'US' }, false],
  ['Nepali audio', { title: 'नेपाली गीत', audioLanguage: 'ne', channelCountry: 'NP' }, false],
  ['Korean', { title: '오늘의 브이로그 #shorts' }, false],
  ['Pakistan', { title: 'Karachi street food #karachi #pakistan', channelTitle: 'PK eats' }, false],
];
let fail = 0;
for (const [name, meta, want] of cases) {
  const v = C.classify(meta, S);
  const ok = v.block === want; if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(32), v.block, v.score, v.reasons.join(' | '));
}
// other countries
const pk = C.classify({ title: 'Karachi street food #karachi #pakistan' }, { countries: ['PK'] });
console.log('PK block:', pk.block, pk.score); if (!pk.block) fail++;
const br = C.classify({ title: 'Futebol #brasil', channelCountry: '' }, { countries: ['BR'] });
console.log('BR hashtag:', br.block, br.score, br.reasons);
const brd = C.classify({ title: 'x', channelCountry: 'BR' }, { countries: ['BR','IN'] });
console.log('BR declared:', brd.block); if (!brd.block) fail++;
console.log(fail ? `${fail} FAILED` : "all passed"); process.exitCode = fail ? 1 : 0;

// Instagram Reels: caption + tagged location + business city
const ig = [
  ['IG location India', { title: 'Sunset vibes ✨', channelTitle: 'travelwithsam', location: 'Marine Drive, Mumbai' }, true],
  ['IG Hindi audio title', { title: 'wait for end 😂', audioTitle: 'तेरे बिना ज़िंदगी', channelTitle: 'x' }, true],
  ['IG Hinglish caption', { title: 'Jab bhai ne kya bola yaar 😂 #reels', channelTitle: 'rohan' }, true],
  ['IG US location', { title: 'Coffee run', channelTitle: 'jess', location: 'Brooklyn, New York' }, false],
  ['IG business country', { title: 'New drop', channelCountry: 'IN', channelTitle: 'brand' }, true],
];
for (const [name, meta, want] of ig) {
  const v = C.classify(meta, S);
  const ok = v.block === want; if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(32), v.block, v.score, v.reasons.join(' | '));
}
console.log(fail ? `${fail} FAILED (incl. Instagram)` : 'Instagram cases passed'); process.exitCode = fail ? 1 : 0;
