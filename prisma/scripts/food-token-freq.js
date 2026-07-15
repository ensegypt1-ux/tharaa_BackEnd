const fs = require('fs');
const path = require('path');

const text = fs.readFileSync(path.join(__dirname, 'excel-catalog-out.txt'), 'utf8');
const lines = text.split(/\r?\n/);
let current = null;
const products = [];
for (const line of lines) {
  const m = line.match(/^===PRODUCTS:(.+) \(/);
  if (m) { current = m[1]; continue; }
  if (current === 'مواد غذايه' && line && !line.startsWith('===')) products.push(line);
}

function normalizeAr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/ـ/g, '')
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const freq = new Map();
for (const p of products) {
  const tokens = normalizeAr(p).split(' ').filter((t) => t.length >= 3);
  for (const t of tokens.slice(0, 4)) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
}
const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 120);
console.log(top.map(([k, v]) => `${v}\t${k}`).join('\n'));
