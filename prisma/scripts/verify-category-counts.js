const { PrismaClient } = require('@prisma/client');
const Redis = require('ioredis');

const prisma = new PrismaClient();

async function main() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redis = new Redis(redisUrl);
  const deleted = await redis.del('categories:public');
  console.log('CLEARED_CACHE', deleted);

  const categories = await prisma.category.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
  });
  const counts = await prisma.product.groupBy({
    by: ['categoryId'],
    where: { deletedAt: null, isActive: true },
    _count: { _all: true },
  });
  const direct = new Map(counts.map((r) => [r.categoryId, r._count._all]));

  const roots = categories.filter((c) => !c.parentId);
  const report = [];
  for (const root of roots) {
    const children = categories.filter((c) => c.parentId === root.id);
    const directRoot = direct.get(root.id) || 0;
    const childDirects = children.map((ch) => ({
      nameAr: ch.nameAr,
      productCount: direct.get(ch.id) || 0,
      isEmpty: (direct.get(ch.id) || 0) === 0,
    }));
    const recursive =
      directRoot + childDirects.reduce((s, c) => s + c.productCount, 0);
    report.push({
      nameAr: root.nameAr,
      productCount: recursive,
      isEmpty: recursive === 0,
      directOnly: directRoot,
      childrenSample: childDirects.slice(0, 3),
      childrenCount: children.length,
    });
  }
  console.log(JSON.stringify(report, null, 2));

  // Hit live API if up
  try {
    const res = await fetch('http://localhost:3000/api/v1/categories');
    const json = await res.json();
    const data = json.data || json;
    console.log('API_STATUS', res.status);
    console.log(
      'API_ROOTS',
      JSON.stringify(
        (Array.isArray(data) ? data : []).map((c) => ({
          nameAr: c.nameAr,
          productCount: c.productCount,
          isEmpty: c.isEmpty,
          children: (c.children || []).length,
          firstChild: c.children?.[0]
            ? {
                nameAr: c.children[0].nameAr,
                productCount: c.children[0].productCount,
                isEmpty: c.children[0].isEmpty,
              }
            : null,
        })),
        null,
        2,
      ),
    );
  } catch (e) {
    console.log('API_UNREACHABLE', e.message);
  }

  await redis.quit();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
