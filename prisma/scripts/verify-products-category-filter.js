const parent = 'cd201785-4f7e-4e21-b330-99ad3886d902';
const child = 'b95be7cb-d3a3-4b7a-a874-72a8f1808ca3';

const cases = [
  ['omit', `http://localhost:3000/api/v1/products?page=1&limit=1&categoryId=${parent}`],
  [
    'false',
    `http://localhost:3000/api/v1/products?page=1&limit=1&categoryId=${parent}&includeChildren=false`,
  ],
  [
    'true',
    `http://localhost:3000/api/v1/products?page=1&limit=1&categoryId=${parent}&includeChildren=true`,
  ],
  ['child', `http://localhost:3000/api/v1/products?page=1&limit=20&categoryId=${child}`],
  [
    'search',
    `http://localhost:3000/api/v1/products?page=1&limit=3&categoryId=${parent}&q=${encodeURIComponent('حليب')}`,
  ],
  ['page2', `http://localhost:3000/api/v1/products?page=2&limit=10&categoryId=${parent}`],
];

(async () => {
  for (const [label, url] of cases) {
    const r = await fetch(url);
    const j = await r.json();
    console.log(
      JSON.stringify({
        label,
        status: r.status,
        total: j.meta?.total,
        len: j.data?.length,
        sample: j.data?.[0]?.nameAr ?? null,
      }),
    );
  }
})();
