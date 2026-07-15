import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
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

  console.log('===CATEGORIES===');
  for (const c of cats) {
    console.log(
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
  console.log('TOTAL_PRODUCTS', total);

  for (const c of cats) {
    if (c._count.products === 0) continue;
    const products = await prisma.product.findMany({
      where: { categoryId: c.id, deletedAt: null },
      select: { id: true, nameAr: true, nameEn: true, sku: true },
      orderBy: { nameAr: 'asc' },
    });
    console.log(`===PRODUCTS:${c.nameAr} (${products.length})===`);
    for (const p of products) {
      console.log(
        JSON.stringify({
          id: p.id,
          nameAr: p.nameAr,
          nameEn: p.nameEn,
          sku: p.sku,
        }),
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
