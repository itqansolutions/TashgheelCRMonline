'use strict';
// Regression: in the RTL (Arabic) layout the remaining-time label must be an isolated LTR run, otherwise
// "47h 56m" renders as "h 56m47" (hour count detached). Both branches (hours+minutes, days+hours) are checked.
const fs = require('fs'); const assert = require('assert');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'frontend/src/pages/RealEstate/Reservations.jsx'), 'utf8');
const m = src.match(/const timeLeft = [\s\S]*?\n  \};/);
assert(m, 'timeLeft not found');
const body = m[0];
const spans = body.match(/<span dir="ltr"[^>]*unicodeBidi: 'isolate'/g) || [];
assert.equal(spans.length, 2, 'both time-left branches must be wrapped in an isolated LTR span');
assert(!/text: \(\s*<span>\s*<span className="num-en"/.test(body), 'bare <span> wrapper must not remain');
assert.equal((src.match(/<span dir="ltr" style=\{\{ display: 'inline-block', unicodeBidi: 'isolate' \}\}><span className="num-en">\+(24|48)<\/span>h<\/span>/g)||[]).length, 2, 'extend buttons +24h/+48h must be isolated');
console.log('PASS reservation time-left is bidi-isolated in both branches');
