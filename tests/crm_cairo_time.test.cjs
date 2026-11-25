const assert=require('assert');
(async()=>{const {cairoTime}=await import('../frontend/src/utils/cairoTime.mjs');
assert.strictEqual(cairoTime('2027-03-01T07:00:00.000Z'),'2027-03-01 09:00'); // winter UTC+2
assert.strictEqual(cairoTime('2026-07-01T06:00:00.000Z'),'2026-07-01 09:00'); // summer UTC+3
assert.strictEqual(cairoTime('2026-11-24T22:30:00Z'),'2026-11-25 00:30'); // date rollover
assert.strictEqual(cairoTime('2026-11-24T22:00:00Z'),'2026-11-25 00:00'); // midnight not 24:00
assert.strictEqual(cairoTime('2027-03-01T09:00:00+02:00'),'2027-03-01 09:00');
assert.strictEqual(cairoTime(null),'');assert.strictEqual(cairoTime('nope'),'');
console.log('cairo time ok');})().catch(e=>{console.error(e);process.exit(1)});
