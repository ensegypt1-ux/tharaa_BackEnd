import { ProductsService } from './products.service';

describe('ProductsService category filtering', () => {
  const parentId = 'cd201785-4f7e-4e21-b330-99ad3886d902';
  const childId = '11111111-1111-4111-8111-111111111111';
  const siblingChildId = '22222222-2222-4222-8222-222222222222';

  let prisma: {
    category: { findMany: jest.Mock };
    product: { count: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: ProductsService;
  let lastWhere: Record<string, unknown> | undefined;

  beforeEach(() => {
    lastWhere = undefined;
    prisma = {
      category: { findMany: jest.fn() },
      product: {
        count: jest.fn(async ({ where }) => {
          lastWhere = where;
          return 0;
        }),
        findMany: jest.fn(async ({ where }) => {
          lastWhere = where;
          return [];
        }),
      },
      $transaction: jest.fn(async (items: unknown[]) => Promise.all(items as Promise<unknown>[])),
    };

    service = new ProductsService(
      prisma as never,
      { calculateUnitPrice: jest.fn() } as never,
      {} as never,
      { getActiveOffersForProducts: jest.fn().mockResolvedValue([]) } as never,
      { del: jest.fn() } as never,
      { getPublicUrl: jest.fn() } as never,
    );

    jest
      .spyOn(service as never, 'mapProductsWithPricing' as never)
      .mockResolvedValue([] as never);
  });

  it('includes descendants when categoryId is a parent and includeChildren is omitted', async () => {
    prisma.category.findMany.mockResolvedValue([
      { id: childId },
      { id: siblingChildId },
    ]);

    await service.listPublic({ page: 1, limit: 20, categoryId: parentId });

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { parentId: parentId, deletedAt: null },
      select: { id: true },
    });
    expect(lastWhere).toMatchObject({
      deletedAt: null,
      isActive: true,
      categoryId: { in: [parentId, childId, siblingChildId] },
    });
  });

  it('returns direct products only when categoryId is a child and includeChildren is omitted', async () => {
    prisma.category.findMany.mockResolvedValue([]);

    await service.listPublic({ page: 1, limit: 20, categoryId: childId });

    expect(lastWhere).toMatchObject({
      deletedAt: null,
      isActive: true,
      categoryId: childId,
    });
  });

  it('returns direct products only when includeChildren is explicitly false on a parent', async () => {
    await service.listPublic({
      page: 1,
      limit: 20,
      categoryId: parentId,
      includeChildren: false,
    });

    expect(prisma.category.findMany).not.toHaveBeenCalled();
    expect(lastWhere).toMatchObject({
      categoryId: parentId,
    });
  });

  it('returns direct products only when includeChildren is the string "false"', async () => {
    await service.listPublic({
      page: 1,
      limit: 20,
      categoryId: parentId,
      includeChildren: 'false' as unknown as boolean,
    });

    expect(prisma.category.findMany).not.toHaveBeenCalled();
    expect(lastWhere).toMatchObject({
      categoryId: parentId,
    });
  });

  it('includes children when includeChildren is explicitly true', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: childId }]);

    await service.listPublic({
      page: 1,
      limit: 20,
      categoryId: parentId,
      includeChildren: true,
    });

    expect(lastWhere).toMatchObject({
      categoryId: { in: [parentId, childId] },
    });
  });
});
