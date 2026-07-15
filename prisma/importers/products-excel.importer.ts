import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const COL_PRODUCT = 'أسم الصنف';
const COL_PRICE = 'سعر البيع';
const COL_QTY = 'الكمية';
const COL_CATEGORY = 'اسم المجموعة';

const SUMMARY_NAMES = new Set([
  'الإجمالي',
  'الاجمالي',
  'المجموع',
  'مجموع',
  'إجمالي',
  'اجمالي',
  'total',
  'totals',
  'grand total',
]);

export type ProductsExcelImportSummary = {
  totalRowsRead: number;
  productsCreated: number;
  productsUpdated: number;
  categoriesCreated: number;
  rowsSkipped: number;
  invalidPrices: number;
  invalidQuantities: number;
  duplicateRows: number;
  skippedReasons: Record<string, number>;
};

function normalizeText(value: unknown): string {
  if (value == null) {
    return '';
  }
  return String(value).trim().replace(/\s+/g, ' ');
}

function normalizeHeaderCell(value: unknown): string {
  return normalizeText(value);
}

function generateSku(categoryNorm: string, productNorm: string): string {
  const hash = createHash('sha1')
    .update(`${categoryNorm}|${productNorm}`, 'utf8')
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();
  return `XLS-${hash}`;
}

function parseNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const cleaned = String(value)
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '')
    .trim();
  if (!cleaned) {
    return null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isSummaryProductName(name: string): boolean {
  const lower = name.toLowerCase();
  if (SUMMARY_NAMES.has(name) || SUMMARY_NAMES.has(lower)) {
    return true;
  }
  return (
    name.includes('الإجمالي') ||
    name.includes('الاجمالي') ||
    name.includes('المجموع')
  );
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const cells = row.map(normalizeHeaderCell);
    const hasProduct = cells.includes(COL_PRODUCT);
    const hasPrice = cells.includes(COL_PRICE);
    const hasQty = cells.includes(COL_QTY);
    const hasCategory = cells.includes(COL_CATEGORY);
    if (hasProduct && hasPrice && hasQty && hasCategory) {
      return i;
    }
  }
  return -1;
}

function bump(
  reasons: Record<string, number>,
  reason: string,
): void {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

/**
 * Idempotent Excel product/category/inventory importer.
 * Only mutates products with generated XLS-* SKUs.
 */
export async function importProductsFromExcel(
  prisma: PrismaClient,
  excelPath?: string,
): Promise<ProductsExcelImportSummary> {
  const filePath =
    excelPath ??
    join(__dirname, '..', 'seed-data', 'products.xlsx');

  if (!existsSync(filePath)) {
    throw new Error(`Excel seed file not found: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel workbook has no sheets');
  }

  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(
    workbook.Sheets[sheetName],
    { header: 1, defval: null, raw: false },
  );

  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) {
    throw new Error(
      `Could not find header row with columns: ${COL_PRODUCT}, ${COL_PRICE}, ${COL_QTY}, ${COL_CATEGORY}`,
    );
  }

  const header = (rows[headerIndex] ?? []).map(normalizeHeaderCell);
  const idxProduct = header.indexOf(COL_PRODUCT);
  const idxPrice = header.indexOf(COL_PRICE);
  const idxQty = header.indexOf(COL_QTY);
  const idxCategory = header.indexOf(COL_CATEGORY);

  const summary: ProductsExcelImportSummary = {
    totalRowsRead: 0,
    productsCreated: 0,
    productsUpdated: 0,
    categoriesCreated: 0,
    rowsSkipped: 0,
    invalidPrices: 0,
    invalidQuantities: 0,
    duplicateRows: 0,
    skippedReasons: {},
  };

  // Load existing non-deleted top-level categories into a normalization map
  const existingCategories = await prisma.category.findMany({
    where: { deletedAt: null, parentId: null },
    select: { id: true, nameAr: true },
  });
  const categoryByNorm = new Map<string, string>();
  for (const cat of existingCategories) {
    categoryByNorm.set(normalizeText(cat.nameAr), cat.id);
  }

  const seenSkusInFile = new Set<string>();

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    summary.totalRowsRead += 1;

    const productName = normalizeText(row[idxProduct]);
    const categoryName = normalizeText(row[idxCategory]);
    const rawPrice = row[idxPrice];
    const rawQty = row[idxQty];

    const allEmpty =
      !productName &&
      !categoryName &&
      (rawPrice == null || String(rawPrice).trim() === '') &&
      (rawQty == null || String(rawQty).trim() === '');

    if (allEmpty) {
      summary.rowsSkipped += 1;
      bump(summary.skippedReasons, 'empty_row');
      continue;
    }

    if (!productName || isSummaryProductName(productName)) {
      summary.rowsSkipped += 1;
      bump(summary.skippedReasons, 'summary_or_missing_product_name');
      continue;
    }

    if (!categoryName) {
      summary.rowsSkipped += 1;
      bump(summary.skippedReasons, 'missing_category');
      continue;
    }

    const price = parseNumber(rawPrice);
    if (price == null || price < 0) {
      summary.rowsSkipped += 1;
      summary.invalidPrices += 1;
      bump(summary.skippedReasons, 'invalid_price');
      continue;
    }

    const qtyRaw = parseNumber(rawQty);
    if (qtyRaw == null || qtyRaw < 0) {
      summary.rowsSkipped += 1;
      summary.invalidQuantities += 1;
      bump(summary.skippedReasons, 'invalid_quantity');
      continue;
    }

    const quantity = Math.round(qtyRaw);
    if (quantity < 0) {
      summary.rowsSkipped += 1;
      summary.invalidQuantities += 1;
      bump(summary.skippedReasons, 'invalid_quantity');
      continue;
    }

    const productNorm = normalizeText(productName);
    const categoryNorm = normalizeText(categoryName);
    const sku = generateSku(categoryNorm, productNorm);

    if (seenSkusInFile.has(sku)) {
      summary.duplicateRows += 1;
    }
    seenSkusInFile.add(sku);

    let categoryId = categoryByNorm.get(categoryNorm);
    if (!categoryId) {
      const created = await prisma.category.create({
        data: {
          parentId: null,
          nameAr: categoryNorm,
          nameEn: categoryNorm,
          sortOrder: categoryByNorm.size + 1,
          isActive: true,
        },
      });
      categoryId = created.id;
      categoryByNorm.set(categoryNorm, categoryId);
      summary.categoriesCreated += 1;
    }

    const isActive = quantity > 0;
    const existing = await prisma.product.findUnique({
      where: { sku },
      include: { inventory: true },
    });

    if (existing) {
      // Only update Excel-imported products (XLS-*). Skip collision with other SKUs.
      if (!existing.sku?.startsWith('XLS-')) {
        summary.rowsSkipped += 1;
        bump(summary.skippedReasons, 'sku_collision_non_excel');
        continue;
      }

      await prisma.product.update({
        where: { id: existing.id },
        data: {
          categoryId,
          nameAr: productNorm,
          nameEn: productNorm,
          descriptionAr: null,
          descriptionEn: null,
          unit: '1',
          hasVariants: false,
          regularPrice: price,
          salePrice: null,
          isActive,
          deletedAt: null,
        },
      });

      if (existing.inventory) {
        await prisma.inventory.update({
          where: { id: existing.inventory.id },
          data: { quantity },
        });
      } else {
        await prisma.inventory.create({
          data: {
            productId: existing.id,
            quantity,
            reservedQuantity: 0,
          },
        });
      }

      summary.productsUpdated += 1;
    } else {
      await prisma.product.create({
        data: {
          categoryId,
          nameAr: productNorm,
          nameEn: productNorm,
          descriptionAr: null,
          descriptionEn: null,
          sku,
          unit: '1',
          hasVariants: false,
          regularPrice: price,
          salePrice: null,
          isActive,
          inventory: {
            create: {
              quantity,
              reservedQuantity: 0,
            },
          },
        },
      });
      summary.productsCreated += 1;
    }
  }

  return summary;
}

export function logProductsExcelImportSummary(
  summary: ProductsExcelImportSummary,
): void {
  console.log('Excel products import summary:');
  console.log(`  Total rows read:      ${summary.totalRowsRead}`);
  console.log(`  Products created:     ${summary.productsCreated}`);
  console.log(`  Products updated:     ${summary.productsUpdated}`);
  console.log(`  Categories created:   ${summary.categoriesCreated}`);
  console.log(`  Rows skipped:         ${summary.rowsSkipped}`);
  console.log(`  Invalid prices:       ${summary.invalidPrices}`);
  console.log(`  Invalid quantities:   ${summary.invalidQuantities}`);
  console.log(`  Duplicate rows:       ${summary.duplicateRows}`);
  const reasons = Object.entries(summary.skippedReasons);
  if (reasons.length > 0) {
    console.log('  Skip reasons:');
    for (const [reason, count] of reasons) {
      console.log(`    - ${reason}: ${count}`);
    }
  }
}
