const TARGET = 'https://www.wxhbts.com/zz.php';

function clean(value) {
  return String(value ?? '').replace(/[<>]/g, '').trim();
}

function parseItems(html) {
  const items = [];
  const re = /var\s+d\s*=\s*(\{[\s\S]*?\})\s*;\s*d\.idx\s*=/g;
  let match;
  while ((match = re.exec(html))) {
    try {
      const item = JSON.parse(match[1]);
      if (item && (item.nick || item.url || item.price !== undefined)) {
        items.push({
          nick: clean(item.nick),
          price: item.price ?? '',
          score: clean(item.score),
          report: clean(item.report),
          dian: clean(item.dian),
          ji: clean(item.ji),
          wan: clean(item.wan),
          wan1: clean(item.wan1),
          gong: clean(item.gong),
          gong1: clean(item.gong1),
          url: /^https?:\/\//i.test(String(item.url || '')) ? String(item.url) : ''
        });
      }
    } catch (_) {
      // Ignore a malformed item and keep the rest of the response usable.
    }
  }
  return items;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const kw = (url.searchParams.get('kw') || '').trim();
  const pages = Math.max(1, Math.min(50, Number(url.searchParams.get('pages') || 1)));
  if (!kw) return Response.json({ error: '请输入型号' }, { status: 400 });
  if (!/^(iphone|ipad)\b/i.test(kw)) {
    return Response.json({ error: '仅支持以 iPhone / iPad 开头的关键词' }, { status: 400 });
  }

  const target = new URL(TARGET);
  target.searchParams.set('kw', kw);
  target.searchParams.set('pages', String(pages));
  try {
    const response = await fetch(target, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Mozilla/5.0 (compatible; AihuisouReplica/1.0)'
      },
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    if (!response.ok) throw new Error(`目标页面返回 HTTP ${response.status}`);
    const html = await response.text();
    const items = parseItems(html);
    return Response.json({ source: TARGET, keyword: kw, pages, items }, {
      headers: { 'cache-control': 'public, max-age=60, s-maxage=300' }
    });
  } catch (error) {
    return Response.json({ error: `暂时无法获取目标页面：${error.message}` }, { status: 502 });
  }
}
