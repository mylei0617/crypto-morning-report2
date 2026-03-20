/**
 * 📰 加密早报 — MiniMax + OKX
 * Railway + GitHub Actions 定时版
 * 聚焦 BTC 信号 + TRUMP + 恐贪指数
 */

// Node 24 内置 fetch，无需 node-fetch
const MINIMAX_API_KEY  = process.env.MINIMAX_API_KEY;
const TELEGRAM_TOKEN   = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const MINIMAX_URL = "https://api.minimaxi.com/v1/text/chatcompletion_v2";
const OKX_URL     = "https://www.okx.com/api/v5";

const myFetch = fetch;

// ─── 校验 ─────────────────────────────────
if (!MINIMAX_API_KEY || !TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error("缺少环境变量: MINIMAX_API_KEY / TELEGRAM_TOKEN / TELEGRAM_CHAT_ID");
  process.exit(0);
}

// ─── 发 Telegram ────────────────────────────
async function tg(text, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await myFetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "Markdown" }),
      });
      const data = await res.json();
      if (data.ok) return;
      console.log(`Telegram attempt ${i+1} failed:`, data.description);
    } catch (e) {
      console.log(`Telegram attempt ${i+1} error:`, e.message);
    }
    if (i < retries - 1) await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error("Telegram发送失败");
}

// ─── MiniMax ────────────────────────────────
async function askMiniMax(prompt) {
  const res = await myFetch(MINIMAX_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${MINIMAX_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "MiniMax-M2.5-highspeed",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!data.choices) throw new Error("MiniMax返回异常: " + JSON.stringify(data));
  return data.choices[0].message.content;
}

// ─── OKX 数据 ───────────────────────────────
async function getOKXTicker(instId) {
  const r    = await myFetch(`${OKX_URL}/market/ticker?instId=${instId}`);
  const data = await r.json();
  return data.data[0];
}

async function getOKXCandles(instId) {
  const r    = await myFetch(`${OKX_URL}/market/candles?instId=${instId}&bar=1H&limit=50`);
  const data = await r.json();
  return data.data.map(k => ({
    open: parseFloat(k[1]), high: parseFloat(k[2]),
    low: parseFloat(k[3]), close: parseFloat(k[4])
  }));
}

async function getFearGreed() {
  try {
    const r    = await myFetch("https://api.alternative.me/fng/?limit=1");
    const data = await r.json();
    return data.data[0];
  } catch { return { value: "N/A", value_classification: "未知" }; }
}

function calcIndicators(candles) {
  const closes = candles.map(c => c.close);
  const n      = closes.length;
  const ma7    = closes.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const ma25   = closes.slice(-25).reduce((a, b) => a + b, 0) / 25;
  const gains  = [], losses = [];
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  const ag  = gains.reduce((a, b) => a + b, 0) / 14 || 0;
  const al  = losses.reduce((a, b) => a + b, 0) / 14 || 0;
  const rsi = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  return {
    price: closes[n - 1],
    ma7:   ma7.toFixed(0),
    ma25:  ma25.toFixed(0),
    rsi:   rsi.toFixed(1),
    aboveMa7: closes[n - 1] > ma7,
  };
}

// ─── 主函数 ─────────────────────────────────
async function main() {
  console.log("📰 早报系统启动...");
  const date = new Date().toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long", day: "numeric", weekday: "short"
  });

  try {
    console.log("📡 拉取数据...");
    const [btcTicker, btcCandles, fearGreed] = await Promise.all([
      getOKXTicker("BTC-USDT"),
      getOKXCandles("BTC-USDT"),
      getFearGreed(),
    ]);

    // TRUMP
    let trumpLine = "TRUMP：暂无行情";
    try {
      const t      = await getOKXTicker("TRUMP-USDT");
      const tPrice = parseFloat(t.last).toFixed(4);
      const tChg   = ((parseFloat(t.last) - parseFloat(t.open24h)) / parseFloat(t.open24h) * 100).toFixed(1);
      trumpLine    = `TRUMP：$${tPrice}  ${parseFloat(tChg) >= 0 ? "📈" : "📉"} ${tChg}%`;
    } catch {}

    const ind    = calcIndicators(btcCandles);
    const btcChg = ((parseFloat(btcTicker.last) - parseFloat(btcTicker.open24h)) / parseFloat(btcTicker.open24h) * 100).toFixed(1);
    const fg     = parseInt(fearGreed.value) || 0;

    let fgText = "";
    if      (fg <= 24) fgText = "极度恐慌 — 可留意抄底机会";
    else if (fg <= 44) fgText = "恐慌 — 谨慎入场";
    else if (fg <= 55) fgText = "中性 — 等待方向";
    else if (fg <= 75) fgText = "贪婪 — 追高需小心";
    else               fgText = "极度贪婪 — 注意随时回调";

    const data = `
BTC价格: $${parseFloat(btcTicker.last).toLocaleString()}  24h涨跌: ${btcChg}%
24h最高: $${parseFloat(btcTicker.high24h).toLocaleString()}  24h最低: $${parseFloat(btcTicker.low24h).toLocaleString()}
MA7: $${ind.ma7}  MA25: $${ind.ma25}  RSI: ${ind.rsi}
价格${ind.aboveMa7 ? "在MA7之上（偏多）" : "在MA7之下（偏空）"}
恐贪指数: ${fearGreed.value}/100（${fearGreed.value_classification}）`;

    console.log("🧠 MiniMax 分析中...");
    const analysis = await askMiniMax(
      `你是加密货币短线交易助手。根据以下数据，用中文生成极简早报。

数据：
${data}

严格按以下格式输出，每行不超过30字，不加任何额外内容：

BTC信号：[🟢做多 / 🔴做空 / 🟡观望]
理由：[一句话，20字以内]
支撑位：$[数字]
压力位：$[数字]
操作：[一句具体建议，20字以内]`
    );

    const report =
`🌅 *加密早报 · ${date}*

₿ *BTC · $${parseFloat(btcTicker.last).toLocaleString()} · ${parseFloat(btcChg) >= 0 ? "+" : ""}${btcChg}%*
${analysis}

🎭 *${trumpLine}*
等trumppoints网站更新再操作

😨 *恐贪指数：${fearGreed.value}/100*
${fgText}

⚠️ _仅供参考，非投资建议_`;

    await tg(report);
    console.log("✅ 早报已发送！");
    console.log("─────────────────");
    console.log(report);

  } catch (err) {
    console.error("❌ 出错了:", err.message);
    try { await tg(`⚠️ 早报失败：${err.message}`); } catch {}
  }
}

main();
