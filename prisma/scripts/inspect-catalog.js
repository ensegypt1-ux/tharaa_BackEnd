const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  const lines = [];
  const cats = await prisma.category.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      sortOrder: true,
      isActive: true,
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  });

  lines.push('===CATEGORIES===');
  for (const c of cats) {
    lines.push(
      JSON.stringify({
        id: c.id,
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        productCount: c._count.products,
      }),
    );
  }

  const total = await prisma.product.count({ where: { deletedAt: null } });
  lines.push('TOTAL_PRODUCTS ' + total);

  for (const c of cats) {
    if (c._count.products === 0) continue;
    const products = await prisma.product.findMany({
      where: { categoryId: c.id, deletedAt: null },
      select: { id: true, nameAr: true, nameEn: true, sku: true },
      orderBy: { nameAr: 'asc' },
    });
    lines.push(`===PRODUCTS:${c.nameAr} (${products.length})===`);
    for (const p of products) {
      lines.push(
        JSON.stringify({
          id: p.id,
          nameAr: p.nameAr,
          nameEn: p.nameEn,
          sku: p.sku,
        }),
      );
    }
  }

  const out = path.join(__dirname, 'inspect-catalog-out.txt');
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log('Wrote', out, 'lines', lines.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
