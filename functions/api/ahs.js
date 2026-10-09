// 爱回收「严选」二手商品数据源
// 网关：https://dubai.aihuishou.com/ahs-yanxuan-service
// 鉴权：Ahs-Sign = MD5(秒级时间戳 + 固定盐)，另有 Ahs-App-Id / Ahs-App-Version / Ahs-Device-Id
// 说明：官方商品列表接口 products/search-goods-v2 受阿里云 WAF 保护（JS 挑战），无法在 Worker 内调用；
//       改走同一网关下可用的推荐流 products/rec（服务端免登录、免 Cookie 即可返回真实在售商品）。

const BASE = 'https://dubai.aihuishou.com/ahs-yanxuan-service';
const SALT = '34694d9d74954784';
const DEVICE_ID = '19e6bf962eb29d-0bb6534bec0dc4-26061851-2073600-19e6bf962eca29';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const SCENES = [
  'FS_HOME_KINGKONG_APPLE_01',
  'FS_HOME_KINGKONG_HUAWEI_01',
  'FS_HOME_KINGKONG_XIAOMI_01',
  'FS_HOME_KINGKONG_OPPO_01',
  'FS_HOME_KINGKONG_VIVO_01',
  'FS_HOME_KINGKONG_HONOR_01',
  'FS_HOME_KINGKONG_ANDROID_01',
  'FS_SELECTED_HOME_01',
  'FS_HOME_01',
  'FS_CHANNEL_PHONE_01'
];

const CONCURRENCY = 8;
const MAX_PAGES_PER_SCENE = 6;
const CACHE_TTL = 10 * 60 * 1000;
const MAX_SUBREQUESTS = 44;

/* ---------------- MD5（Workers 的 WebCrypto 不支持 MD5，这里用纯 JS 实现） ---------------- */
function md5cycle(x, k) {
  let a = x[0], b = x[1], c = x[2], d = x[3];
  a = ff(a, b, c, d, k[0], 7, -680876936);
  d = ff(d, a, b, c, k[1], 12, -389564586);
  c = ff(c, d, a, b, k[2], 17, 606105819);
  b = ff(b, c, d, a, k[3], 22, -1044525330);
  a = ff(a, b, c, d, k[4], 7, -176418897);
  d = ff(d, a, b, c, k[5], 12, 1200080426);
  c = ff(c, d, a, b, k[6], 17, -1473231341);
  b = ff(b, c, d, a, k[7], 22, -45705983);
  a = ff(a, b, c, d, k[8], 7, 1770035416);
  d = ff(d, a, b, c, k[9], 12, -1958414417);
  c = ff(c, d, a, b, k[10], 17, -42063);
  b = ff(b, c, d, a, k[11], 22, -1990404162);
  a = ff(a, b, c, d, k[12], 7, 1804603682);
  d = ff(d, a, b, c, k[13], 12, -40341101);
  c = ff(c, d, a, b, k[14], 17, -1502002290);
  b = ff(b, c, d, a, k[15], 22, 1236535329);

  a = gg(a, b, c, d, k[1], 5, -165796510);
  d = gg(d, a, b, c, k[6], 9, -1069501632);
  c = gg(c, d, a, b, k[11], 14, 643717713);
  b = gg(b, c, d, a, k[0], 20, -373897302);
  a = gg(a, b, c, d, k[5], 5, -701558691);
  d = gg(d, a, b, c, k[10], 9, 38016083);
  c = gg(c, d, a, b, k[15], 14, -660478335);
  b = gg(b, c, d, a, k[4], 20, -405537848);
  a = gg(a, b, c, d, k[9], 5, 568446438);
  d = gg(d, a, b, c, k[14], 9, -1019803690);
  c = gg(c, d, a, b, k[3], 14, -187363961);
  b = gg(b, c, d, a, k[8], 20, 1163531501);
  a = gg(a, b, c, d, k[13], 5, -1444681467);
  d = gg(d, a, b, c, k[2], 9, -51403784);
  c = gg(c, d, a, b, k[7], 14, 1735328473);
  b = gg(b, c, d, a, k[12], 20, -1926607734);

  a = hh(a, b, c, d, k[5], 4, -378558);
  d = hh(d, a, b, c, k[8], 11, -2022574463);
  c = hh(c, d, a, b, k[11], 16, 1839030562);
  b = hh(b, c, d, a, k[14], 23, -35309556);
  a = hh(a, b, c, d, k[1], 4, -1530992060);
  d = hh(d, a, b, c, k[4], 11, 1272893353);
  c = hh(c, d, a, b, k[7], 16, -155497632);
  b = hh(b, c, d, a, k[10], 23, -1094730640);
  a = hh(a, b, c, d, k[13], 4, 681279174);
  d = hh(d, a, b, c, k[0], 11, -358537222);
  c = hh(c, d, a, b, k[3], 16, -722521979);
  b = hh(b, c, d, a, k[6], 23, 76029189);
  a = hh(a, b, c, d, k[9], 4, -640364487);
  d = hh(d, a, b, c, k[12], 11, -421815835);
  c = hh(c, d, a, b, k[15], 16, 530742520);
  b = hh(b, c, d, a, k[2], 23, -995338651);

  a = ii(a, b, c, d, k[0], 6, -198630844);
  d = ii(d, a, b, c, k[7], 10, 1126891415);
  c = ii(c, d, a, b, k[14], 15, -1416354905);
  b = ii(b, c, d, a, k[5], 21, -57434055);
  a = ii(a, b, c, d, k[12], 6, 1700485571);
  d = ii(d, a, b, c, k[3], 10, -1894986606);
  c = ii(c, d, a, b, k[10], 15, -1051523);
  b = ii(b, c, d, a, k[1], 21, -2054922799);
  a = ii(a, b, c, d, k[8], 6, 1873313359);
  d = ii(d, a, b, c, k[15], 10, -30611744);
  c = ii(c, d, a, b, k[6], 15, -1560198380);
  b = ii(b, c, d, a, k[13], 21, 1309151649);
  a = ii(a, b, c, d, k[4], 6, -145523070);
  d = ii(d, a, b, c, k[11], 10, -1120210379);
  c = ii(c, d, a, b, k[2], 15, 718787259);
  b = ii(b, c, d, a, k[9], 21, -343485551);

  x[0] = add32(a, x[0]);
  x[1] = add32(b, x[1]);
  x[2] = add32(c, x[2]);
  x[3] = add32(d, x[3]);
}

function cmn(q, a, b, x, s, t) {
  a = add32(add32(a, q), add32(x, t));
  return add32((a << s) | (a >>> (32 - s)), b);
}
function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }

function md5blk(s) {
  const blks = [];
  for (let i = 0; i < 64; i += 4) {
    blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
  }
  return blks;
}

function md51(s) {
  const n = s.length;
  const state = [1732584193, -271733879, -1732584194, 271733878];
  let i;
  for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i)));
  s = s.substring(i - 64);
  const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
  tail[i >> 2] |= 0x80 << ((i % 4) << 3);
  if (i > 55) {
    md5cycle(state, tail);
    for (i = 0; i < 16; i++) tail[i] = 0;
  }
  tail[14] = n * 8;
  md5cycle(state, tail);
  return state;
}

const HEX = '0123456789abcdef'.split('');
function rhex(n) {
  let s = '';
  for (let j = 0; j < 4; j++) s += HEX[(n >> (j * 8 + 4)) & 0x0f] + HEX[(n >> (j * 8)) & 0x0f];
  return s;
}
function add32(a, b) { return (a + b) & 0xffffffff; }
function md5(str) { return md51(str).map(rhex).join(''); }

/* ---------------- 请求爱回收网关 ---------------- */
function signHeaders() {
  const ts = Math.floor(Date.now() / 1000);
  return {
    'Ahs-App-Id': '10002',
    'Ahs-App-Version': '7.18.0',
    'Ahs-Timestamp': String(ts),
    'Ahs-Sign': md5(String(ts) + SALT),
    'Ahs-Device-Id': DEVICE_ID,
    'Ahs-Session-Id': '',
    'X-Requested-With': 'axios',
    'Content-Type': 'application/json;charset=UTF-8',
    Accept: 'application/json, text/plain, */*',
    'User-Agent': UA,
    Referer: 'https://m.aihuishou.com/',
    Origin: 'https://m.aihuishou.com'
  };
}

async function ahsPost(path, body) {
  const response = await fetch(BASE + path, {
    method: 'POST',
    headers: signHeaders(),
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`爱回收接口 HTTP ${response.status}`);
  if (/^\s*</.test(text)) throw new Error('爱回收接口被安全策略拦截');
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (_) {
    throw new Error('爱回收接口返回内容无法解析');
  }
  if (payload.code !== 0) throw new Error(payload.resultMessage || `爱回收接口错误码 ${payload.code}`);
  return payload.data;
}

/* ---------------- 字段映射 ---------------- */
function labelOf(item, group) {
  const list = Array.isArray(item.conditionLabels) ? item.conditionLabels : [];
  const hit = list.find((x) => x && x.group === group);
  return hit ? String(hit.label || '') : '';
}

function batteryOf(item) {
  const orig = labelOf(item, '原厂电池');
  if (orig) return orig;
  const third = labelOf(item, '第三方电池');
  if (third) return third;
  const tags = Array.isArray(item.productTag) ? item.productTag : [];
  const hit = tags.find((t) => /电池\s*\d/.test(String(t)));
  return hit ? String(hit).replace(/^电池/, '') : '';
}

function batteryTextOf(item) {
  const b = batteryOf(item);
  if (!b) return '';
  const third = labelOf(item, '第三方电池') ? '（第三方）' : '';
  return `电池健康${b}${third}`;
}

function batteryLevel(battery) {
  const raw = String(battery || '');
  if (/全新/.test(raw)) return '100%';
  const m = raw.match(/(\d{2,3})\s*%/);
  if (!m) return '';
  const n = Number(m[1]);
  if (n >= 100) return '100%';
  if (n >= 95) return '95%-99%';
  if (n >= 90) return '90%-95%';
  if (n >= 85) return '85%-90%';
  if (n >= 80) return '80%-85%';
  return '80%以下';
}

function toRow(item, brandName) {
  const battery = batteryOf(item);
  const screen = labelOf(item, '屏幕');
  const shell = labelOf(item, '外壳');
  const func = labelOf(item, '功能');
  const warranty = labelOf(item, '官方在保');
  const whole = labelOf(item, '整机外观');

  const repairs = [];
  if (labelOf(item, '第三方电池')) repairs.push(`第三方电池·${labelOf(item, '第三方电池')}`);
  const funcNorm = func.replace(/无维修/g, '');
  if (/维修|更换|拆修/.test(funcNorm)) repairs.push(`功能·${func}`);
  if (/更换|维修|拆修/.test(screen)) repairs.push(`屏幕·${screen}`);
  if (/更换|维修|拆修/.test(shell)) repairs.push(`外壳·${shell}`);
  const hasRepair = repairs.length > 0;

  const funcIssue = func && !/完好/.test(func) ? func : '';

  const imgs = Array.isArray(item.images) ? item.images : [];
  const saleGoodsNo = item.saleGoodsNo || item.productNo || '';

  return {
    nick: item.name || '',
    price: item.price ?? '',
    orig: item.originalPrice ?? '',
    market: item.marketAvgPrice ?? '',
    score: item.gaeaFinenessName || '',
    memory: item.memoryDesc || '',
    report: '',
    dian: warranty ? `官方在保·${warranty}` : '',
    ji: item.supplySource === 'SELF' ? '爱回收自营' : '',
    wan: [screen ? `屏幕${screen}` : '', shell ? `外壳${shell}` : ''].filter(Boolean).join(' '),
    wan1: whole ? `整机${whole}` : '',
    gong: batteryTextOf(item),
    gong1: hasRepair ? repairs.join(' ') : funcIssue ? `功能·${funcIssue}` : '功能完好无换修',
    condition: item.gaeaFinenessName || '',
    repairFlag: hasRepair ? 'has-repair' : 'clean',
    funcIssue: funcIssue,
    img: imgs[0] || item.detailFirstImage || '',
    url: saleGoodsNo ? `https://m.aihuishou.com/n/ofn/strict-selected/product/detail?saleGoodsNo=${encodeURIComponent(saleGoodsNo)}` : '',
    labels: Array.isArray(item.productTag) ? item.productTag : [],
    brand: brandName || '',
    brandId: item.gaeaBrandId ?? '',
    model: item.gaeaProductName || '',
    battery: batteryLevel(battery),
    batteryRaw: battery,
    screen: screen,
    shell: shell,
    func: func,
    warranty: warranty,
    whole: whole,
    goodsNo: saleGoodsNo,
    promotion: item.activityTag || '',
    discount: item.activityTag || '',
    reportNo: item.gaeaQualityReportNo || '',
    flaws: Array.isArray(item.flawImages) ? item.flawImages.length : 0
  };
}

/* 仅回传前端真正消费的字段，把 300KB+ 的响应压到一半左右 */
const CLIENT_FIELDS = [
  'nick', 'price', 'orig', 'score', 'memory', 'report', 'gong', 'dian', 'ji', 'wan',
  'gong1', 'funcIssue', 'promotion', 'labels', 'img', 'url', 'brand', 'screen', 'shell',
  'func', 'warranty', 'repairFlag', 'battery', 'goodsNo'
];
function slim(row) {
  const out = {};
  for (const key of CLIENT_FIELDS) {
    const value = row[key];
    if (value === '' || value === null || value === undefined) continue;
    if (Array.isArray(value) && !value.length) continue;
    out[key] = value;
  }
  return out;
}

async function mapLimit(list, limit, worker) {
  const results = new Array(list.length);
  let cursor = 0;
  const runners = new Array(Math.min(limit, list.length || 1)).fill(null).map(async () => {
    for (;;) {
      const index = cursor++;
      if (index >= list.length) return;
      results[index] = await worker(list[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/* ---------------- 商品池（进程内增量缓存） ----------------
 * 缓存按「已抓取到第几页」记录，深度从 1 加到 3 时只补差量，
 * 前端因此可以先用 pages=1 秒出首屏，再后台补齐到 pages=3。
 */
function emptyCache() {
  return { at: 0, pages: 0, brands: {}, items: new Map(), requests: 0, dirty: false };
}
let poolCache = emptyCache();
let inflight = null;

async function loadBrands() {
  try {
    const data = await ahsPost('/products/category-and-brand', { cityId: 306, localCityId: 306, locateCityId: 306 });
    const map = {};
    for (const cat of Array.isArray(data) ? data : []) {
      for (const b of (cat && cat.brands) || []) map[b.gaeaBrandId] = b.gaeaBrandName;
    }
    return map;
  } catch (_) {
    return {};
  }
}

async function fetchScenePage(scene, page) {
  try {
    const data = await ahsPost('/products/rec', {
      cityId: 306,
      localCityId: 306,
      locateCityId: 306,
      poolId: '',
      pageIndex: page,
      pageSize: 20,
      scene
    });
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

async function buildPool(fromPage, toPage) {
  const jobs = [];
  for (const scene of SCENES) {
    for (let page = fromPage; page < toPage; page++) jobs.push({ scene, page });
  }
  const needBrands = poolCache.items.size === 0;
  const budget = Math.max(1, MAX_SUBREQUESTS - (needBrands ? 1 : 0));
  const limited = jobs.slice(0, budget);

  const [brands, pages] = await Promise.all([
    needBrands ? loadBrands() : Promise.resolve(null),
    mapLimit(limited, CONCURRENCY, ({ scene, page }) => fetchScenePage(scene, page))
  ]);

  const items = [];
  for (const list of pages) for (const item of list) items.push(item);
  return { items, brands, fetched: limited.length };
}

async function ensurePool(pagesPerScene) {
  for (let guard = 0; guard < 6; guard++) {
    if (poolCache.items.size && Date.now() - poolCache.at >= CACHE_TTL) poolCache = emptyCache();
    if (poolCache.items.size && poolCache.pages >= pagesPerScene) return;
    if (inflight) { await inflight.catch(() => {}); continue; }
    const from = poolCache.pages;
    inflight = buildPool(from, pagesPerScene)
      .then(({ items, brands, fetched }) => {
        for (const item of items) {
          const key = item.saleGoodsNo || item.productNo;
          if (key && !poolCache.items.has(key)) poolCache.items.set(key, item);
        }
        if (brands) Object.assign(poolCache.brands, brands);
        poolCache.pages = Math.max(poolCache.pages, pagesPerScene);
        poolCache.requests += fetched;
        poolCache.at = Date.now();
        poolCache.dirty = true;
      })
      .finally(() => { inflight = null; });
    await inflight;
  }
}

/* ---------------- 商品池持久化（Cache API，跨 isolate / 跨用户共享） ----------------
 * Pages Functions 不会自动缓存函数响应，这里显式写入边缘缓存：
 * 冷访客同步构建，之后所有访客直接命中缓存；过期时先返回旧池、后台刷新。
 */
const POOL_CACHE_KEY = 'https://pool-cache.aihuishou.internal/yanxuan/v2';
const POOL_CACHE_SECONDS = 1800;
const hasCacheApi = typeof caches !== 'undefined' && caches && caches.default;

async function hydratePool() {
  if (poolCache.items.size || !hasCacheApi) return;
  try {
    const hit = await caches.default.match(new Request(POOL_CACHE_KEY));
    if (!hit) return;
    const data = await hit.json();
    if (!data || !Array.isArray(data.items) || !data.items.length) return;
    const items = new Map();
    for (const item of data.items) {
      const key = item.saleGoodsNo || item.productNo;
      if (key) items.set(key, item);
    }
    poolCache = {
      at: Number(data.at) || Date.now(),
      pages: Number(data.pages) || 0,
      brands: data.brands || {},
      items,
      requests: Number(data.requests) || 0,
      dirty: false
    };
  } catch (_) { /* 缓存不可用时忽略，退化为直连 */ }
}

async function persistPool() {
  if (!hasCacheApi || !poolCache.dirty) return;
  try {
    const body = JSON.stringify({
      at: poolCache.at,
      pages: poolCache.pages,
      brands: poolCache.brands,
      requests: poolCache.requests,
      items: Array.from(poolCache.items.values())
    });
    await caches.default.put(
      new Request(POOL_CACHE_KEY),
      new Response(body, {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${POOL_CACHE_SECONDS}` }
      })
    );
    poolCache.dirty = false;
  } catch (_) { /* 忽略写缓存失败 */ }
}

async function refreshPool(pagesPerScene) {
  try {
    await ensurePool(pagesPerScene);
    await persistPool();
  } catch (_) { /* 后台刷新失败不影响本次响应 */ }
}

function poolRows() {
  const rows = [];
  for (const item of poolCache.items.values()) {
    rows.push(toRow(item, poolCache.brands[item.gaeaBrandId] || ''));
  }
  return rows;
}

/* ---------------- 核心机况补全（电池效率 / 充电次数 / 系统版本 / 保修情况） ----------------
 * 列表接口 products/rec 不含这四项，需按 saleGoodsNo 调 GET products/goods-tag-param 逐条取。
 * 因此拆成独立入口 /api/ahs?cond=1&ids=a,b,c，由前端在首屏渲染后分批后台补齐；
 * 结果落 Cache API，回访用户直接命中，不再回源。
 */
const COND_CACHE_KEY = 'https://pool-cache.aihuishou.internal/yanxuan/cond/v1';
const COND_CACHE_SECONDS = 3600;
const COND_BATCH = 45;
const COND_CONCURRENCY = 45;

let condCache = new Map();
let condHydrated = false;
let condDirty = false;

async function hydrateCond() {
  if (condHydrated) return;
  condHydrated = true;
  if (!hasCacheApi) return;
  try {
    const hit = await caches.default.match(new Request(COND_CACHE_KEY));
    if (!hit) return;
    const data = await hit.json();
    if (data && typeof data === 'object') {
      for (const key of Object.keys(data)) condCache.set(key, data[key]);
    }
  } catch (_) { /* 缓存不可用则退化为直连 */ }
}

async function persistCond() {
  if (!hasCacheApi || !condDirty) return;
  condDirty = false;
  try {
    let merged = {};
    const prev = await caches.default.match(new Request(COND_CACHE_KEY));
    if (prev) {
      const old = await prev.json().catch(() => null);
      if (old && typeof old === 'object') merged = old;
    }
    for (const [key, value] of condCache) merged[key] = value;
    await caches.default.put(
      new Request(COND_CACHE_KEY),
      new Response(JSON.stringify(merged), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${COND_CACHE_SECONDS}` }
      })
    );
  } catch (_) { /* 忽略写缓存失败 */ }
}

async function fetchCond(id) {
  try {
    const response = await fetch(`${BASE}/products/goods-tag-param?saleGoodsNo=${encodeURIComponent(id)}`, {
      headers: signHeaders()
    });
    // 请求失败返回 undefined：不写缓存，下次访问重试
    if (!response.ok) return undefined;
    const text = await response.text();
    if (/^\s*</.test(text)) return undefined;
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (_) {
      return undefined;
    }
    // 业务层明确「无此商品 / 无数据」返回 null：可长期缓存，避免反复回源
    if (payload.code !== 0 || !payload.data) return null;
    const list = Array.isArray(payload.data.machineConditionList) ? payload.data.machineConditionList : [];
    const pick = (name) => {
      const hit = list.find((x) => x && x.name === name);
      return hit ? String(hit.value == null ? '' : hit.value).trim() : '';
    };
    const cond = {
      battery: pick('电池效率'),
      cycles: pick('充电次数'),
      system: pick('系统版本'),
      warranty: pick('保修情况')
    };
    if (!cond.battery && !cond.cycles && !cond.system && !cond.warranty) return null;
    return cond;
  } catch (_) {
    return undefined;
  }
}

async function handleCond(url, context) {
  await hydrateCond();

  const ids = [];
  const seen = new Set();
  for (const raw of String(url.searchParams.get('ids') || '').split(',')) {
    const id = raw.trim();
    if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
    if (ids.length >= COND_BATCH) break;
  }
  if (!ids.length) return Response.json({ error: '缺少 ids 参数' }, { status: 400 });

  const todo = ids.filter((id) => !condCache.has(id));
  if (todo.length) {
    await mapLimit(todo, COND_CONCURRENCY, async (id) => {
      const value = await fetchCond(id);
      if (value === undefined) return; // 请求失败：不落缓存，下次重试
      condCache.set(id, value);
      condDirty = true;
    });
    if (context && typeof context.waitUntil === 'function') context.waitUntil(persistCond());
    else await persistCond();
  }

  const items = {};
  for (const id of ids) {
    const value = condCache.get(id);
    if (value) items[id] = value;
  }
  return Response.json(
    { items, requested: ids.length, known: Object.keys(items).length },
    { headers: { 'cache-control': 'public, max-age=300' } }
  );
}

/* ---------------- 入口 ---------------- */
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (url.searchParams.get('cond') === '1') return handleCond(url, context);

  const kw = (url.searchParams.get('kw') || '').trim();
  const pagesPerScene = Math.max(1, Math.min(MAX_PAGES_PER_SCENE, Number(url.searchParams.get('pages') || 3)));

  try {
    await hydratePool();

    const stale = poolCache.items.size > 0 && Date.now() - poolCache.at >= CACHE_TTL;
    if (stale) {
      // 旧池可用：先秒回，后台再刷新
      if (context && typeof context.waitUntil === 'function') {
        context.waitUntil(refreshPool(pagesPerScene));
      } else {
        await refreshPool(pagesPerScene);
      }
    } else {
      await ensurePool(pagesPerScene);
      if (context && typeof context.waitUntil === 'function' && poolCache.dirty) {
        context.waitUntil(persistPool());
      } else {
        await persistPool();
      }
    }

    const allRows = poolRows();
    let rows = allRows;

    if (kw) {
      const needle = kw.toLowerCase().replace(/\s+/g, '');
      rows = rows.filter((row) => {
        const hay = `${row.nick}${row.model}${row.brand}${row.memory}${row.score}`.toLowerCase().replace(/\s+/g, '');
        return hay.includes(needle);
      });
    }

    const brandCount = {};
    for (const row of allRows) {
      if (row.brand) brandCount[row.brand] = (brandCount[row.brand] || 0) + 1;
    }

    return Response.json(
      {
        source: '爱回收严选',
        keyword: kw,
        total: rows.length,
        poolSize: allRows.length,
        scenes: SCENES.length,
        pages: poolCache.pages,
        requests: poolCache.requests,
        stale,
        brands: Object.entries(brandCount).sort((a, b) => b[1] - a[1]).slice(0, 24).map(([name, count]) => ({ name, count })),
        items: rows.map(slim)
      },
      { headers: { 'cache-control': 'public, max-age=60, s-maxage=300' } }
    );
  } catch (error) {
    return Response.json({ error: error.message || '获取爱回收数据失败' }, { status: 502 });
  }
}
