const MCP_ENDPOINT = 'https://mcp.zhuanzhuan.com/zai/zai-transfer';
const MAX_PAGES = 3;
const CONCURRENCY = 6;

async function callToolOnce(env, name, args) {
  const token = env && env.ZZ_MCP_TOKEN;
  if (!token) throw new Error('服务端未配置转转接口凭据');

  const response = await fetch(MCP_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args }
    })
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('转转接口凭据已失效，请重新获取 Token');
  }
  if (!response.ok) throw new Error(`转转接口返回 HTTP ${response.status}`);

  let payload;
  try {
    payload = await response.json();
  } catch (_) {
    throw new Error('转转接口返回内容无法解析');
  }

  if (payload.error) throw new Error(payload.error.message || '转转接口调用失败');

  const result = payload.result;
  if (!result) throw new Error('转转接口未返回结果');
  if (result.isError) {
    const first = result.content && result.content[0];
    throw new Error(String((first && first.text) || '转转工具执行失败').slice(0, 200));
  }

  const first = result.content && result.content[0];
  return first && first.text ? first.text : '';
}

function isRetriable(message) {
  return /超时|timeout|timed out|502|503|504|HTTP 5\d\d|network|fetch failed/i.test(String(message || ''));
}

async function callTool(env, name, args, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await callToolOnce(env, name, args);
    } catch (error) {
      lastError = error;
      if (i === attempts - 1 || !isRetriable(error.message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)));
    }
  }
  throw lastError;
}

function splitKV(value) {
  const i = value.indexOf('|');
  if (i < 0) return [value.trim(), ''];
  return [value.slice(0, i).trim(), value.slice(i + 1).trim()];
}

function isEmptyValue(value) {
  return !value || value === 'null' || value === 'undefined' || value === '-';
}

function parseDetail(text) {
  const top = {};
  const specs = {};
  const benefits = [];
  const inspections = [];
  let current = null;
  let pendingDefect = null;

  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.replace(/^\s*\|/, '').trim();
    if (!line) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();

    if (key === 'spec') {
      const [name, val] = splitKV(value);
      if (name && !isEmptyValue(val)) specs[name] = val;
    } else if (key === 'benefit') {
      if (!isEmptyValue(value)) benefits.push(value);
    } else if (key === 'inspection') {
      current = { name: value, passed: 0, defectCount: 0, defects: [] };
      inspections.push(current);
      pendingDefect = null;
    } else if (key === 'passedCount' && current) {
      current.passed = Number(value) || 0;
    } else if (key === 'defectCount' && current) {
      current.defectCount = Number(value) || 0;
    } else if (key === 'defectName') {
      pendingDefect = value;
    } else if (key === 'defectContent') {
      if (current && pendingDefect) {
        current.defects.push(`${pendingDefect}·${value}`);
        pendingDefect = null;
      }
    } else if (!isEmptyValue(value)) {
      top[key] = value;
    }
  }

  return { top, specs, benefits, inspections };
}

function pickInspection(inspections, keyword) {
  return inspections.find((item) => item.name && item.name.indexOf(keyword) >= 0) || null;
}

function buildRow(item, detail) {
  const d = detail || { top: {}, specs: {}, benefits: [], inspections: [] };
  const top = d.top || {};
  const specs = d.specs || {};
  const inspections = d.inspections || [];

  const appearance = pickInspection(inspections, '外观');
  const repairArea = pickInspection(inspections, '维修');
  const screenArea = pickInspection(inspections, '屏幕');

  const repairs = [];
  const batterySwap = specs['电池更换情况'] || '';
  if (batterySwap && !/未检出/.test(batterySwap)) repairs.push(`电池${batterySwap}`);
  const screenSwap = specs['屏幕更换情况'] || '';
  if (screenSwap && !/未检出/.test(screenSwap)) repairs.push(`屏幕${screenSwap}`);
  if (repairArea && repairArea.defects.length) repairs.push(...repairArea.defects);
  if (screenArea) {
    repairs.push(...screenArea.defects.filter((x) => /更换|维修|拆修/.test(x)));
  }

  const batteryHealth = specs['电池健康值'] || '';
  const chargeCount = specs['充电次数'] || '';
  const color = specs['颜色'] || '';

  const hasRepair = repairs.length > 0;
  const repairText = hasRepair ? repairs.join(' ') : (detail ? '功能完好无换修' : '');

  return {
    nick: item.title || top.title || '',
    price: item.price !== undefined && item.price !== null && item.price !== '' ? item.price : (top.price || ''),
    score: item.chengSe || top.chengSe || '',
    report: specs['系统版本'] || '',
    dian: chargeCount ? `充电${chargeCount}次` : '',
    ji: specs['购买渠道'] || '',
    wan: appearance && appearance.defects.length ? appearance.defects.join(' ') : '',
    wan1: color ? `颜色${color}` : '',
    gong: batteryHealth ? `电池健康${batteryHealth}` : '',
    gong1: repairText,
    memory: specs['存储容量'] || '',
    condition: specs['成色'] || item.chengSe || '',
    repairFlag: hasRepair ? 'has-repair' : 'clean',
    img: item.infoImage || top.img || '',
    url: item.jumpUrl || top.jumpUrl || '',
    labels: Array.isArray(item.serviceLabelsInfo) ? item.serviceLabelsInfo : [],
    sellingPoint: top.sellingPoint || '',
    promotion: top.promotion || '',
    ref: top.ref || '',
    benefits: d.benefits || [],
    inspections: inspections.map((x) => ({
      name: x.name,
      passed: x.passed,
      defectCount: x.defectCount,
      defects: x.defects
    }))
  };
}

async function mapLimit(list, limit, worker) {
  const results = new Array(list.length);
  let cursor = 0;
  const runners = new Array(Math.min(limit, list.length || 1)).fill(null).map(async () => {
    while (true) {
      const index = cursor++;
      if (index >= list.length) return;
      results[index] = await worker(list[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const kw = (url.searchParams.get('kw') || '').trim();
  const pages = Math.max(1, Math.min(MAX_PAGES, Number(url.searchParams.get('pages') || 1)));
  const order = Math.max(0, Math.min(4, Number(url.searchParams.get('order') || 0)));
  const withDetail = url.searchParams.get('detail') !== '0';

  if (!kw) return Response.json({ error: '请输入型号关键词' }, { status: 400 });

  try {
    const collected = [];
    let token = null;

    for (let page = 0; page < pages; page++) {
      const args = { keyword: kw, priceOrder: order };
      if (token) {
        args.pageToken = token;
      } else {
        args.userIntent = `在转转查找 ${kw} 的在售二手商品`;
      }
      const text = await callTool(context.env, 'search', args);
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (_) {
        throw new Error('转转搜索结果无法解析');
      }
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      collected.push(...items);
      if (!parsed.hasNext || !parsed.nextPageToken || items.length === 0) break;
      token = parsed.nextPageToken;
    }

    let rows;
    if (withDetail && collected.length) {
      const details = await mapLimit(collected, CONCURRENCY, async (item) => {
        try {
          const text = await callTool(context.env, 'product_detail', {
            infoId: item.infoId,
            businessType: item.businessType,
            metric: item.metric
          });
          return parseDetail(text);
        } catch (_) {
          return null;
        }
      });
      rows = collected.map((item, index) => buildRow(item, details[index]));
    } else {
      rows = collected.map((item) => buildRow(item, null));
    }

    return Response.json(
      {
        source: '转转开放平台',
        keyword: kw,
        pages,
        order,
        detail: withDetail,
        total: rows.length,
        items: rows
      },
      { headers: { 'cache-control': 'public, max-age=60, s-maxage=300' } }
    );
  } catch (error) {
    return Response.json({ error: error.message || '获取转转数据失败' }, { status: 502 });
  }
}
