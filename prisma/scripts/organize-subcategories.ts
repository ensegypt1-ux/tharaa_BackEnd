/**
 * Idempotent subcategory organizer for Tharaa Market.
 *
 * - Creates subcategories under existing main categories (matched by normalized Arabic name).
 * - Reassigns products by updating only Product.categoryId.
 * - Safe to re-run; dry-run with --dry-run.
 *
 * Usage:
 *   npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" prisma/scripts/organize-subcategories.ts --dry-run
 *   npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" prisma/scripts/organize-subcategories.ts --apply
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Rule = {
  key: string;
  nameAr: string;
  nameEn: string;
  /** Keywords / phrases matched against normalized product name (first hit wins). */
  keywords: string[];
  isFallback?: boolean;
};

type ParentPlan = {
  parentNameAr: string;
  rules: Rule[];
};

function normalizeAr(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[إأآٱا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ/g, '')
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesKeyword(normalizedName: string, keyword: string): boolean {
  const k = normalizeAr(keyword);
  if (!k) return false;
  // Multi-word: contiguous phrase. Single token: space-padded only
  // (avoids "بيض" matching "ابيض", "سكر" matching "سكريم").
  if (k.includes(' ')) {
    return normalizedName.includes(k);
  }
  return ` ${normalizedName} `.includes(` ${k} `);
}

function matchRule(normalizedName: string, rules: Rule[]): Rule | null {
  for (const rule of rules) {
    if (rule.isFallback) continue;
    for (const kw of rule.keywords) {
      if (includesKeyword(normalizedName, kw)) {
        return rule;
      }
    }
  }
  return rules.find((r) => r.isFallback) ?? null;
}

/**
 * Plans derived from live Excel/DB catalog analysis (12 main categories, ~9400 products).
 * Only parents with meaningful product clusters get subcategories.
 */
const PLANS: ParentPlan[] = [
  {
    parentNameAr: 'مواد غذايه',
    rules: [
      {
        key: 'dairy',
        nameAr: 'ألبان وأجبان',
        nameEn: 'Dairy & Cheese',
        keywords: [
          'حليب', 'لبن', 'لبنه', 'زبادي', 'جبن', 'جبنه', 'زبده', 'زبدة',
          'قشطه', 'قشطة', 'اكتيفيا', 'اكتيفا', 'نادك', 'المراعي', 'الصافي',
          'بيكاه', 'السعوديه حليب', 'موزريلا', 'حلومي', 'فيتا', 'كريمة',
        ],
      },
      {
        key: 'poultry-meat',
        nameAr: 'لحوم ودواجن',
        nameEn: 'Meat & Poultry',
        keywords: [
          'دجاج', 'فراخ', 'لحم', 'استربس', 'استريبس', 'برجر', 'اسكالوب',
          'اجنحه', 'اجنحة', 'اجنجه', 'افخاذ', 'فخذ', 'صدور', 'وراك', 'اوراك',
          'لانشون', 'مرتديلا', 'بسطرمه', 'هوت دوج', 'نقانق', 'سجق', 'كفته',
          'كباب', 'شنيتسل', 'ناجتس',
        ],
      },
      {
        key: 'fish',
        nameAr: 'أسماك وتونة',
        nameEn: 'Fish & Tuna',
        keywords: [
          'تونه', 'تونة', 'سمك', 'روبيان', 'جمبري', 'سردين', 'سالمون',
          'تون ', 'ثونه',
        ],
      },
      {
        key: 'rice',
        nameAr: 'أرز',
        nameEn: 'Rice',
        keywords: ['ارز', 'بسمتي', 'عنبر'],
      },
      {
        key: 'oil',
        nameAr: 'زيوت',
        nameEn: 'Oils',
        keywords: ['زيت زيتون', 'زيت دوار', 'زيت قنولا', 'زيت ذره', 'زيت ذرة', 'زيت علالي', 'زيت'],
      },
      {
        key: 'drinks',
        nameAr: 'مشروبات وعصائر',
        nameEn: 'Drinks & Juices',
        keywords: [
          'عصير', 'مشروب', 'شراب', 'مياه', 'ماء', 'كولا', 'بيبسي', 'ميرندا',
          'سفن', 'موهنو', 'ريد بول', 'انيرجي', 'مشروب غازي',
        ],
      },
      {
        key: 'tea-coffee',
        nameAr: 'شاي وقهوة',
        nameEn: 'Tea & Coffee',
        keywords: ['شاي', 'شاهي', 'قهوه', 'قهوة', 'نسكافيه', 'نسكافه', 'كوفي'],
      },
      {
        key: 'pasta',
        nameAr: 'معكرونة ونودلز',
        nameEn: 'Pasta & Noodles',
        keywords: [
          'مكرونه', 'معكرونه', 'مكرونة', 'معكرونة', 'اندومي', 'نودلز', 'نودل',
          'سباجيتي', 'اسبجتي', 'شعيريه', 'شعيرية', 'باستا',
        ],
      },
      {
        key: 'canned',
        nameAr: 'معلبات وبقوليات',
        nameEn: 'Canned & Legumes',
        keywords: [
          'فول', 'حمص', 'فاصوليا', 'ذره', 'ذرة', 'بازلاء', 'عدس', 'طحينه',
          'طحينة', 'مربي', 'مربا', 'معلبه', 'معلب', 'اطعمه معلبه',
        ],
      },
      {
        key: 'sauces',
        nameAr: 'صلصات وخل',
        nameEn: 'Sauces & Vinegar',
        keywords: [
          'صلصه', 'صلصة', 'كاتشب', 'مايونيز', 'مسترد', 'خردل', 'شطه', 'شطة',
          'هريسه', 'خل ', 'خلل', 'تتبيله', 'تتبيلة',
        ],
      },
      {
        key: 'snacks',
        nameAr: 'سناكات وبسكويت',
        nameEn: 'Snacks & Biscuits',
        keywords: [
          'بسكويت', 'ويفر', 'شيبس', 'شيبسي', 'برنجلز', 'ليز', 'دوريتوس',
          'سناك', 'بطاطس ليز', 'بطاطس برنجلز', 'بطاطس البطل', 'كوكي', 'تمتم',
        ],
      },
      {
        key: 'sweets',
        nameAr: 'شوكولاتة وحلويات',
        nameEn: 'Chocolate & Sweets',
        keywords: [
          'شوكولاته', 'شوكولاتة', 'شوكلاته', 'شوكو', 'كيك', 'جيلي', 'حلاوه',
          'حلاوة', 'حلوي', 'حلوى', 'علك', 'لبان', 'صاص', 'مرارشميلو', 'مرشميلو',
          'جالكسي', 'سنيكرز', 'كيت كات', 'كاكاو',
        ],
      },
      {
        key: 'icecream',
        nameAr: 'مثلجات',
        nameEn: 'Ice Cream',
        keywords: ['ايس كريم', 'اي سكريم', 'اس كيمو', 'ايسكريم', 'مثلج'],
      },
      {
        key: 'eggs',
        nameAr: 'بيض',
        nameEn: 'Eggs',
        keywords: ['بيض'],
      },
      {
        key: 'sugar-flour',
        nameAr: 'سكر ودقيق',
        nameEn: 'Sugar & Flour',
        keywords: ['سكر', 'دقيق', 'خميره', 'خميرة', 'نشا'],
      },
      {
        key: 'honey-dates',
        nameAr: 'عسل وتمر',
        nameEn: 'Honey & Dates',
        keywords: ['عسل', 'تمر', 'تمور', 'عجوه'],
      },
      {
        key: 'bakery',
        nameAr: 'خبز ومخبوزات',
        nameEn: 'Bread & Bakery',
        keywords: ['خبز', 'توست', 'صمون', 'فطير', 'كرواسون', 'بقسماط', 'سمبوسه', 'سمبوسة'],
      },
      {
        key: 'frozen',
        nameAr: 'مجمدات غذائية',
        nameEn: 'Frozen Foods',
        keywords: ['مجمد', 'مجمدة'],
      },
      {
        key: 'baby',
        nameAr: 'أغذية أطفال',
        nameEn: 'Baby Food',
        keywords: ['اطفال', 'سيريلاك', 'نان ', 'سيميلاك', 'ايتاميل'],
      },
      {
        key: 'other',
        nameAr: 'أخرى',
        nameEn: 'Other',
        keywords: [],
        isFallback: true,
      },
    ],
  },
  {
    parentNameAr: 'منظفات',
    rules: [
      {
        key: 'laundry',
        nameAr: 'غسيل ملابس',
        nameEn: 'Laundry',
        keywords: [
          'غسيل', 'برسيل', 'اريال', 'تايد', 'اومو', 'مسحوق', 'جل غسيل',
          'منعم', 'مبيض ملابس',
        ],
      },
      {
        key: 'dishes',
        nameAr: 'غسيل صحون',
        nameEn: 'Dishwashing',
        keywords: ['صحون', 'جلي', 'فيري', 'غسول الصحون', 'غسيل الصحون'],
      },
      {
        key: 'floors',
        nameAr: 'مطهرات وأرضيات',
        nameEn: 'Disinfectants & Floors',
        keywords: [
          'ارضيات', 'مطهر', 'كلوركس', 'داك', 'ليزول', 'فلاش', 'هاربيك',
          'معطر ارضيات', 'منظف متعدد',
        ],
      },
      {
        key: 'tissues',
        nameAr: 'مناديل ومحارم',
        nameEn: 'Tissues',
        keywords: ['مناديل', 'محارم', 'كلينكس', 'تينشو'],
      },
      {
        key: 'diapers',
        nameAr: 'حفاضات ومستلزمات نسائية',
        nameEn: 'Diapers & Feminine Care',
        keywords: [
          'حفاض', 'حفاظ', 'بامبرز', 'مولفيكس', 'فوط', 'نسائيه', 'نسائية',
          'دائما', 'برايفت', 'اولويز',
        ],
      },
      {
        key: 'personal',
        nameAr: 'عناية شخصية',
        nameEn: 'Personal Care',
        keywords: [
          'شامبو', 'صابون', 'لوشن', 'استحمام', 'معجون', 'فرشاه اسنان',
          'فرشاة اسنان', 'غسول فم', 'مزيل عرق', 'كريم',
        ],
      },
      {
        key: 'pests',
        nameAr: 'مبيدات حشرات',
        nameEn: 'Pest Control',
        keywords: ['قاتل', 'حشرات', 'صراصير', 'نمل', 'ناموس', 'رذاذ قاتل'],
      },
      {
        key: 'household',
        nameAr: 'مستلزمات منزلية',
        nameEn: 'Household Supplies',
        keywords: [
          'اكياس زباله', 'اكياس زبالة', 'اسفنج', 'اسفنج', 'سلك خشن',
          'قفاز', 'سفرة', 'اعواد اذن', 'اعواد اسنان',
        ],
      },
      {
        key: 'other',
        nameAr: 'أخرى',
        nameEn: 'Other',
        keywords: [],
        isFallback: true,
      },
    ],
  },
  {
    parentNameAr: 'خضروات و فواكه',
    rules: [
      {
        key: 'veg',
        nameAr: 'خضروات',
        nameEn: 'Vegetables',
        keywords: [
          'طماط', 'خيار', 'بصل', 'ثوم', 'بطاطس', 'بطاطا', 'بطاطس', 'بطاطا',
          'جزر', 'خس', 'فلفل', 'باذنجان', 'كوسه', 'كوسا', 'ملفوف', 'كرنب',
          'باميه', 'ملوخيه', 'فجل', 'شمندر', 'لفت', 'زهرة', 'قرنبيط',
          'ذرة', 'ذره', 'بطاطس', 'بطاطا', 'بطاطس', 'خضار', 'بخارة', 'سيم',
          'زنجبيل', 'حار هندي', 'طرشي',
        ],
      },
      {
        key: 'fruit',
        nameAr: 'فواكه',
        nameEn: 'Fruits',
        keywords: [
          'تفاح', 'موز', 'برتقال', 'ليمون', 'عنب', 'فراوله', 'فراولة',
          'مانجو', 'بطيخ', 'حبحب', 'شمام', 'كيوي', 'اناناس', 'خوخ',
          'مشمش', 'رمان', 'تين', 'جوافه', 'افوكادو', 'افكادو', 'افندي',
          'توت', 'جوز الهند', 'رطب', 'بلح', 'تمر',
        ],
      },
      {
        key: 'herbs',
        nameAr: 'ورقيات وأعشاب',
        nameEn: 'Herbs & Greens',
        keywords: ['ورقيات', 'بقدونس', 'كزبره', 'كزبرة', 'نعناع', 'نعنع', 'شبت', 'شبث', 'جرجير', 'ريحان', 'حبق'],
      },
      {
        key: 'other',
        nameAr: 'أخرى',
        nameEn: 'Other',
        keywords: [],
        isFallback: true,
      },
    ],
  },
  {
    parentNameAr: 'مكسرات وبهارات',
    rules: [
      {
        key: 'nuts',
        nameAr: 'مكسرات وبذور',
        nameEn: 'Nuts & Seeds',
        keywords: [
          'فستق', 'لوز', 'كاجو', 'بندق', 'جوز', 'صنوبر', 'مكسرات', 'زبيب',
          'حب شمس', 'بذر', 'فول سوداني', 'سوداني', 'بذور الشيا', 'حب الشملول',
        ],
      },
      {
        key: 'spices',
        nameAr: 'بهارات وتوابل',
        nameEn: 'Spices & Seasonings',
        keywords: [
          'بهار', 'بهارت', 'كمون', 'كركم', 'فلفل', 'قرفه', 'قرفة', 'هيل',
          'بابريكا', 'باربريكا', 'ثوم مطحون', 'بصل مجفف', 'كاري', 'ملح',
          'سمن', 'مرقه', 'مرقة', 'زعفران', 'حبه البركه', 'حبة البركة',
          'اوريغانو', 'اكليل', 'بابونج', 'حلبه', 'حلبة', 'برغل', 'جريش',
        ],
      },
      {
        key: 'other',
        nameAr: 'أخرى',
        nameEn: 'Other',
        keywords: [],
        isFallback: true,
      },
    ],
  },
  {
    parentNameAr: 'حلويات',
    rules: [
      {
        key: 'candy',
        nameAr: 'حلوى وسكاكر',
        nameEn: 'Candy & Confectionery',
        keywords: [
          'حلو', 'حلوي', 'حلوى', 'جلي', 'توفي', 'مرشميلو', 'شوكو', 'شوكولاته',
          'جالكسي', 'جلكسي', 'ترولي', 'سكاكر', 'مصاص',
        ],
      },
      {
        key: 'biscuits',
        nameAr: 'بسكويت',
        nameEn: 'Biscuits',
        keywords: ['بسكويت', 'ويفر', 'بقسماط'],
      },
      {
        key: 'other',
        nameAr: 'أخرى',
        nameEn: 'Other',
        keywords: [],
        isFallback: true,
      },
    ],
  },
  {
    parentNameAr: 'اواني',
    rules: [
      {
        key: 'cups-plates',
        nameAr: 'أكواب وأطباق',
        nameEn: 'Cups & Plates',
        keywords: [
          'اكواب', 'كوب', 'صحن', 'اطباق', 'طبق', 'كاس', 'كأس', 'شناق',
        ],
      },
      {
        key: 'cookware',
        nameAr: 'أواني طبخ',
        nameEn: 'Cookware',
        keywords: [
          'ابريق', 'قدر', 'طاوه', 'طاسه', 'طنجرة', 'صينيه', 'صينية',
          'سكاكين', 'معلقه', 'شوكه',
        ],
      },
      {
        key: 'kitchen-tools',
        nameAr: 'أدوات ومستلزمات مطبخ',
        nameEn: 'Kitchen Tools',
        keywords: [
          'اكياس', 'حافظه', 'حافظات', 'ميزان', 'فتاحه', 'مبشره', 'اسفنج',
          'اقفال', 'اقلام',
        ],
      },
      {
        key: 'other',
        nameAr: 'أخرى',
        nameEn: 'Other',
        keywords: [],
        isFallback: true,
      },
    ],
  },
  {
    parentNameAr: 'اكترونيات',
    rules: [
      {
        key: 'chargers',
        nameAr: 'شواحن وكابلات',
        nameEn: 'Chargers & Cables',
        keywords: [
          'شاحن', 'شواحن', 'كيبل', 'كابل', 'اوكس', 'انكر', 'راس بيت',
          'تايب سي', 'توصيله', 'توصيلة', 'تحويلة',
        ],
      },
      {
        key: 'batteries',
        nameAr: 'بطاريات',
        nameEn: 'Batteries',
        keywords: ['بطاريه', 'بطارية', 'بطاريات', 'انرجايزر', 'افريدي', 'ايفريدي'],
      },
      {
        key: 'powerbank',
        nameAr: 'باور بانك',
        nameEn: 'Power Banks',
        keywords: ['باور', 'بنك', 'خازن طاقه', 'خازن طاقة'],
      },
      {
        key: 'audio',
        nameAr: 'صوت وملحقات',
        nameEn: 'Audio & Accessories',
        keywords: [
          'ام بي', 'امبي', 'سبيكر', 'سماعات', 'هيدفون', 'بلوتوث', 'ذكره',
          'ذكرة', 'جيب حمايه', 'حامي كاميرا',
        ],
      },
      {
        key: 'other',
        nameAr: 'أخرى',
        nameEn: 'Other',
        keywords: [],
        isFallback: true,
      },
    ],
  },
  {
    parentNameAr: 'عناية وعطور',
    rules: [
      {
        key: 'perfume',
        nameAr: 'عطور',
        nameEn: 'Perfumes',
        keywords: ['عطر', 'عطور', 'بخور', 'معطر جسم'],
      },
      {
        key: 'care',
        nameAr: 'عناية',
        nameEn: 'Care',
        keywords: ['كريم', 'لوشن', 'شامبو', 'صابون', 'مرطب'],
      },
      {
        key: 'other',
        nameAr: 'أخرى',
        nameEn: 'Other',
        keywords: [],
        isFallback: true,
      },
    ],
  },
];

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || !args.includes('--apply');
  if (!args.includes('--dry-run') && !args.includes('--apply')) {
    console.log('No mode flag given — defaulting to --dry-run. Pass --apply to write.');
  }

  console.log(`\n=== Organize subcategories (${dryRun ? 'DRY-RUN' : 'APPLY'}) ===\n`);

  const parents = await prisma.category.findMany({
    where: { deletedAt: null, parentId: null },
    orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
  });

  const parentByNorm = new Map(
    parents.map((p) => [normalizeAr(p.nameAr), p]),
  );

  let totalProcessed = 0;
  let totalMoved = 0;
  let totalAlreadyOk = 0;
  let totalUnclassified = 0;
  let totalSubsCreated = 0;

  for (const plan of PLANS) {
    const parent = parentByNorm.get(normalizeAr(plan.parentNameAr));
    if (!parent) {
      console.log(`SKIP parent not found: ${plan.parentNameAr}`);
      continue;
    }

    console.log(`\n## Main: ${parent.nameAr} / ${parent.nameEn} (${parent.id})`);

    // Existing children by normalized nameAr
    const existingChildren = await prisma.category.findMany({
      where: { deletedAt: null, parentId: parent.id },
    });
    const childByNorm = new Map(
      existingChildren.map((c) => [normalizeAr(c.nameAr), c]),
    );

    const ruleToCategoryId = new Map<string, string>();

    for (let i = 0; i < plan.rules.length; i++) {
      const rule = plan.rules[i];
      const existing = childByNorm.get(normalizeAr(rule.nameAr));
      if (existing) {
        ruleToCategoryId.set(rule.key, existing.id);
        console.log(`  sub exists: ${rule.nameAr} (${existing.id})`);
        continue;
      }
      if (dryRun) {
        const fakeId = `dry-run:${rule.key}`;
        ruleToCategoryId.set(rule.key, fakeId);
        console.log(`  [dry-run] would create: ${rule.nameAr} / ${rule.nameEn}`);
        totalSubsCreated += 1;
      } else {
        const created = await prisma.category.create({
          data: {
            parentId: parent.id,
            nameAr: rule.nameAr,
            nameEn: rule.nameEn,
            sortOrder: i + 1,
            isActive: true,
          },
        });
        ruleToCategoryId.set(rule.key, created.id);
        childByNorm.set(normalizeAr(rule.nameAr), created);
        console.log(`  created: ${rule.nameAr} (${created.id})`);
        totalSubsCreated += 1;
      }
    }

    // Products currently on this parent OR already in its children
    const childIds = [...ruleToCategoryId.values()].filter(
      (id) => !id.startsWith('dry-run:'),
    );
    const products = await prisma.product.findMany({
      where: {
        deletedAt: null,
        OR: [
          { categoryId: parent.id },
          ...(childIds.length ? [{ categoryId: { in: childIds } }] : []),
        ],
      },
      select: { id: true, nameAr: true, nameEn: true, categoryId: true },
    });

    const assignCounts = new Map<string, number>();
    for (const rule of plan.rules) assignCounts.set(rule.key, 0);

    let moved = 0;
    let alreadyOk = 0;
    let leftOnParent = 0;

    for (const product of products) {
      totalProcessed += 1;
      const normalized = normalizeAr(product.nameAr || product.nameEn);
      const rule = matchRule(normalized, plan.rules);
      if (!rule) {
        leftOnParent += 1;
        totalUnclassified += 1;
        continue;
      }

      const targetId = ruleToCategoryId.get(rule.key)!;
      assignCounts.set(rule.key, (assignCounts.get(rule.key) ?? 0) + 1);

      if (targetId.startsWith('dry-run:')) {
        if (product.categoryId === parent.id) {
          moved += 1;
          totalMoved += 1;
        } else {
          alreadyOk += 1;
          totalAlreadyOk += 1;
        }
        continue;
      }

      if (product.categoryId === targetId) {
        alreadyOk += 1;
        totalAlreadyOk += 1;
        continue;
      }

      if (!dryRun) {
        await prisma.product.update({
          where: { id: product.id },
          data: { categoryId: targetId },
        });
      }
      moved += 1;
      totalMoved += 1;
    }

    console.log('  Assignments:');
    for (const rule of plan.rules) {
      console.log(`    - ${rule.nameAr}: ${assignCounts.get(rule.key) ?? 0}`);
    }
    console.log(
      `  products scanned=${products.length} moved=${moved} alreadyOk=${alreadyOk} leftUnmatched=${leftOnParent}`,
    );
  }

  console.log('\n=== Summary ===');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Subcategories created (or would create): ${totalSubsCreated}`);
  console.log(`Products processed: ${totalProcessed}`);
  console.log(`Products moved: ${totalMoved}`);
  console.log(`Already correct: ${totalAlreadyOk}`);
  console.log(`Unclassified (left on parent / no rule): ${totalUnclassified}`);
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
