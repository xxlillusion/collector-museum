// Headless regression suite for the Collectr import (src/lib/collectr*.ts +
// CollectrImportPanel). Repo convention: msedge channel, and zero console
// errors is part of PASS.
//
// Committed rather than left as a throwaway *.tmp.mjs because the case it
// guards is easy to regress and expensive to notice: a re-import must patch
// quantity/condition while leaving wall slots, featured flags and hang order
// exactly as the user arranged them. It also covers the cross-feeder id rule
// (export script vs PRO CSV), which a bug once broke in a way that would have
// silently duplicated an entire collection.
//
//   npm run dev                       # or set BASE_URL
//   node tools/verify-collectr-import.mjs
//
// Builds its own fixture (canvas-drawn PNGs + collection.json) and wipes
// IndexedDB first, so it is safe to re-run and independent of local data.
// Guest/local provider only — the signed-in Supabase round-trip needs a
// manual pass.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5176';
const FIX = process.env.FIXTURE_DIR ?? path.join(process.cwd(), '.collectr-fixture');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? `\n         ${extra}` : ''}`); }
};
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const ITEMS = [
  { collectrId: 'p1', name: 'Charizard', setName: 'Base Set', cardNumber: '4/102', year: '1999', condition: 'NM', quantity: 3, image: 'img/p1.png', imageSource: 'collectr' },
  { collectrId: 'p2', name: 'Blastoise', setName: 'Base Set', cardNumber: '2/102', year: '1999', grade: 'PSA 9', quantity: 1, image: 'img/p2.png', imageSource: 'collectr' },
  { collectrId: 'p3', name: 'Venusaur', setName: 'Base Set', cardNumber: '15/102', condition: 'LP', quantity: 1, image: 'img/p3.png', imageSource: 'collectr' },
  { collectrId: 'p4', name: 'Pikachu', setName: 'Jungle', cardNumber: '60/64', condition: 'NM', quantity: 2, image: 'img/p4.png', imageSource: 'pokemontcg' },
  { collectrId: 'p5', name: 'No Image Card', setName: 'Promo', quantity: 1, imageSource: 'none' },
  { name: 'Malformed, no id', quantity: 1, image: 'img/p1.png' },
];

const envelope = (items) => JSON.stringify({
  format: 'vendor-museum-collectr', version: 1, source: 'collectr-script',
  exportedAt: '2026-08-15T00:00:00.000Z', items,
}, null, 2);

const browser = await chromium.launch({
  channel: 'msedge', headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());

await page.goto(`${BASE}/sandbox`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

// --- fixture: real decodable PNGs, drawn in-page (drive.tmp.mjs recipe) ------
fs.rmSync(FIX, { recursive: true, force: true });
fs.mkdirSync(path.join(FIX, 'img'), { recursive: true });
const pngs = await page.evaluate(() =>
  ['p1', 'p2', 'p3', 'p4'].map((id, i) => {
    const c = document.createElement('canvas');
    c.width = 100; c.height = 140;
    const g = c.getContext('2d');
    g.fillStyle = ['#c0392b', '#2980b9', '#27ae60', '#f1c40f'][i];
    g.fillRect(0, 0, 100, 140);
    g.fillStyle = '#fff'; g.font = '16px sans-serif'; g.fillText(id, 10, 70);
    return { id, b64: c.toDataURL('image/png').split(',')[1] };
  }));
for (const { id, b64 } of pngs) {
  fs.writeFileSync(path.join(FIX, 'img', `${id}.png`), Buffer.from(b64, 'base64'));
}
fs.writeFileSync(path.join(FIX, 'collection.json'), envelope(ITEMS));
const fixtureFiles = [
  path.join(FIX, 'collection.json'),
  ...pngs.map((p) => path.join(FIX, 'img', `${p.id}.png`)),
];

// --- deterministic start ----------------------------------------------------
await page.evaluate(async () => { indexedDB.deleteDatabase('vendor-museum'); });
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const openPanel = async () => {
  // After an import the panel stays open showing its result, so the collapsed
  // toggle isn't rendered — the file input already is.
  if (await page.locator('#collectr-files-input').count() > 0) return;
  const btn = page.locator('button', { hasText: /Import from Collectr/i }).first();
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await page.waitForTimeout(300);
};
const previewText = () => page.locator('[data-testid="collectr-preview"]').innerText();
const runImport = async () => {
  await page.locator('button', { hasText: /^(Import \d+ card|▶ IMPORT)/i }).first().click();
  await page.waitForSelector('text=/Done —/', { timeout: 60000 });
  await page.waitForTimeout(600);
};
const cardRecords = () => page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('vendor-museum');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return await new Promise((res, rej) => {
    const r = db.transaction('cards').objectStore('cards').getAll();
    // Drop the Blob — it can't cross the page boundary and we only assert metadata.
    r.onsuccess = () => res(r.result.map(({ imageBlob: _imageBlob, ...rest }) => rest));
    r.onerror = () => rej(r.error);
  });
});

console.log('\n== PASS 1: first import (guest / IndexedDB)');
await openPanel();
await page.setInputFiles('#collectr-files-input', fixtureFiles);
await page.waitForSelector('[data-testid="collectr-preview"]', { timeout: 10000 });
const p1 = await previewText();
ok('preview shows 4 new', /New cards\s*4/.test(p1), p1);
ok('preview shows 1 skipped (no image)', /Skipped \(no image\)\s*1/.test(p1), p1);
ok('preview reports the malformed row', /1 unreadable row was skipped/.test(p1), p1);
await runImport();

let recs = await cardRecords();
eq('4 cards saved', recs.length, 4);
const chari = recs.find((r) => r.collectrId === 'p1');
eq('name corrected from filename', chari?.name, 'Charizard');
eq('quantity stored', chari?.quantity, 3);
eq('condition stored', chari?.condition, 'NM');
eq('setName stored', chari?.setName, 'Base Set');
const blastoise = recs.find((r) => r.collectrId === 'p2');
eq('graded card keeps grade', blastoise?.grade, 'PSA 9');
ok('quantity 1 is not persisted', blastoise?.quantity === undefined, JSON.stringify(blastoise));

console.log('\n== PASS 2: ×3 renders on the home tile');
const tiles = await page.locator('body').innerText();
ok('×3 appears in the collection', /×3/.test(tiles));

console.log('\n== PASS 3: curation is applied, then must survive a re-import');
await page.evaluate(async () => {
  const db = await new Promise((res) => {
    const r = indexedDB.open('vendor-museum'); r.onsuccess = () => res(r.result);
  });
  const store = db.transaction('cards', 'readwrite').objectStore('cards');
  const all = await new Promise((res) => { const r = store.getAll(); r.onsuccess = () => res(r.result); });
  for (const rec of all) {
    if (rec.collectrId === 'p1') {
      rec.featured = true; rec.hangOrder = 2; rec.wallSlot = 'N:0:3';
      rec.display = 'walls'; rec.notes = 'my first pull';
      store.put(rec);
    }
  }
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const before = (await cardRecords()).find((r) => r.collectrId === 'p1');
eq('curation seeded',
   { featured: before.featured, hangOrder: before.hangOrder, wallSlot: before.wallSlot, display: before.display, notes: before.notes },
   { featured: true, hangOrder: 2, wallSlot: 'N:0:3', display: 'walls', notes: 'my first pull' });

// p1 quantity 3→5, p3 condition LP→NM, one brand-new card, p4 removed entirely.
const SECOND = [
  { ...ITEMS[0], quantity: 5 },
  ITEMS[1],
  { ...ITEMS[2], condition: 'NM' },
  { collectrId: 'p9', name: 'New Arrival', setName: 'Fossil', quantity: 1, image: 'img/p2.png', imageSource: 'collectr' },
];
fs.writeFileSync(path.join(FIX, 'collection.json'), envelope(SECOND));

await openPanel();
await page.setInputFiles('#collectr-files-input', fixtureFiles);
await page.waitForSelector('[data-testid="collectr-preview"]', { timeout: 10000 });
const p2t = await previewText();
ok('re-import: 1 new', /New cards\s*1/.test(p2t), p2t);
ok('re-import: 2 updated', /Updated\s*2/.test(p2t), p2t);
ok('re-import: 1 already up to date', /Already up to date\s*1/.test(p2t), p2t);
ok('re-import: 1 card not in export', /In your museum, not in this export\s*1/.test(p2t), p2t);
ok('preview shows before→after', /×3/.test(p2t) && /×5/.test(p2t), p2t);
await runImport();

recs = await cardRecords();
const after = recs.find((r) => r.collectrId === 'p1');
eq('quantity updated 3→5', after.quantity, 5);
eq('CURATION SURVIVED',
   { featured: after.featured, hangOrder: after.hangOrder, wallSlot: after.wallSlot, display: after.display, notes: after.notes },
   { featured: true, hangOrder: 2, wallSlot: 'N:0:3', display: 'walls', notes: 'my first pull' });
eq('id unchanged (not recreated)', after.id, before.id);
eq('addedAt unchanged', after.addedAt, before.addedAt);
eq('condition updated on p3', recs.find((r) => r.collectrId === 'p3').condition, 'NM');
eq('total cards now 5', recs.length, 5);
ok('card dropped from Collectr is NOT deleted', !!recs.find((r) => r.collectrId === 'p4'));

console.log('\n== PASS 4: CSV path (Collectr PRO)');
const csv = 'Card Name,Set Name,Card Number,Condition,Quantity,Product ID\n' +
            '"Charizard, holo",Base Set,4/102,NM,7,p1\n' +
            'Brand New CSV Card,Fossil,10/62,LP,1,p42\n';
const csvPath = path.join(FIX, 'collectr-pro.csv');
fs.writeFileSync(csvPath, csv);
await openPanel();
await page.setInputFiles('#collectr-files-input', [csvPath]);
await page.waitForSelector('[data-testid="collectr-preview"]', { timeout: 10000 });
const p3t = await previewText();
ok('csv: quoted comma field parsed, 1 update', /Updated\s*1/.test(p3t), p3t);
ok('csv: imageless new row blocked', /Skipped \(no image\)\s*1/.test(p3t), p3t);

console.log('\n== console health');
ok('zero console errors', errors.length === 0, errors.join('\n         '));

await page.screenshot({ path: path.join(FIX, 'panel.png'), fullPage: false });
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
