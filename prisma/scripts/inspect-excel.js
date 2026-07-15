const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const filePath = path.join(__dirname, '..', 'seed-data', 'products.xlsx');
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });

const COL_PRODUCT = 'أسم الصنف';
const COL_CATEGORY = 'اسم المجموعة';

let headerIndex = -1;
let idxProduct = -1;
let idxCategory = -1;
for (let i = 0; i < rows.length; i++) {
  const cells = (rows[i] || []).map((v) => (v == null ? '' : String(v).trim()));
  if (cells.includes(COL_PRODUCT) && cells.includes(COL_CATEGORY)) {
    headerIndex = i;
    idxProduct = cells.indexOf(COL_PRODUCT);
    idxCategory = cells.indexOf(COL_CATEGORY);
    break;
  }
}

if (headerIndex < 0) {
  console.error('Header not found');
  process.exit(1);
}

const byCat = new Map();
for (let r = headerIndex + 1; r < rows.length; r++) {
  const row = rows[r] || [];
  const product = String(row[idxProduct] ?? '').trim().replace(/\s+/g, ' ');
  const category = String(row[idxCategory] ?? '').trim().replace(/\s+/g, ' ');
  if (!product || !category) continue;
  if (product.includes('الإجمالي') || product.includes('الاجمالي') || product.includes('المجموع')) continue;
  if (!byCat.has(category)) byCat.set(category, []);
  byCat.get(category).push(product);
}

const out = [];
out.push('===CATEGORIES===');
const sorted = [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'));
for (const [cat, products] of sorted) {
  out.push(JSON.stringify({ nameAr: cat, productCount: products.length }));
}
out.push('TOTAL_PRODUCTS ' + [...byCat.values()].reduce((s, a) => s + a.length, 0));

for (const [cat, products] of sorted) {
  const unique = [...new Set(products)].sort((a, b) => a.localeCompare(b, 'ar'));
  out.push(`===PRODUCTS:${cat} (${unique.length} unique / ${products.length} rows)===`);
  for (const p of unique) out.push(p);
}

const outPath = path.join(__dirname, 'excel-catalog-out.txt');
fs.writeFileSync(outPath, out.join('\n'), 'utf8');
console.log('Wrote', outPath);
console.log('Categories:', sorted.length);
console.log('Total product rows:', [...byCat.values()].reduce((s, a) => s + a.length, 0));
