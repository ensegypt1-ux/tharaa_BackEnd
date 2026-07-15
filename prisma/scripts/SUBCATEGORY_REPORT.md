# Subcategory organization report (live DB + Excel catalog)

## Catalog inspected

- **Source:** PostgreSQL `tharaa_market` + `prisma/seed-data/products.xlsx`
- **Main categories:** 12 (unchanged; all remain `parentId = null`)
- **Products:** ~9,400 (XLS-* SKUs + seed items)

| Main category | Products before | Subcategories created |
|---|---|---|
| مواد غذايه | 6634 | 20 (incl. أخرى) |
| منظفات | 1440 | 9 |
| خضروات و فواكه | 182 | 4 |
| مكسرات وبهارات | 291 | 3 |
| حلويات | 68 | 3 |
| اواني | 329 | 4 |
| اكترونيات | 291 | 5 |
| عناية وعطور | 39 | 3 |
| العاب / ملابس / ادوات مدرسية / مجموعة الاصناف | small | none (left flat) |

## Apply results

- **51 subcategories** created
- **9,274 products** moved via `categoryId` update only
- **~126 products** remain on main categories (groups without a plan + leftovers)
- **Idempotent:** re-run dry-run → moved=0, alreadyOk=9274
- **No** deletes, reseeds, ID/SKU/inventory/price/image/order changes

## How to re-run

```bash
cd tharaa_market_api
npm run organize:subcategories:dry
npm run organize:subcategories
```

Script: `prisma/scripts/organize-subcategories.ts`
Migration: `prisma/migrations/20260715123000_category_parent_id`
