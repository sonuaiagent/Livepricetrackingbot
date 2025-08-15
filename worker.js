// livepricetrackingbot – Cloudflare Worker
// Version 10.0.0-LAMBDA-Debug  •  2025-08-16

const BOT_VERSION = "10.0.0-LAMBDA-Debug";
const HEALTH      = "/health";
const WEBHOOK     = "/webhook";
const TEST        = "/test";
const CRON        = "/cron";

/* ╔════════════════════════════════════════════════════╗
   ║  1. LOW-LEVEL HELPERS                              ║
   ╚════════════════════════════════════════════════════╝ */

async function callLambda(env, body) {
  try {
    const r = await fetch(env.AWS_LAMBDA_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body)
    });
    const j = await r.json();
    console.log("DBG-01 Lambda →", j);
    return j;
  } catch (e) {
    console.error("DBG-01E Lambda error", e);
    return { success: false, error: "DBG-01E " + e.message };
  }
}

const tgSend = (tok, p) =>
  fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(p)
  });

async function tgEdit(tok, p) {
  return fetch(`https://api.telegram.org/bot${tok}/editMessageText`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(p)
  });
}

async function supa(env, tbl, met, data = null, query = "") {
  const url = `${env.SUPABASE_URL}/rest/v1/${tbl}${query ? "?" + query : ""}`;
  const opt = {
    method: met,
    headers: {
      "Content-Type": "application/json",
      apikey:        env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      Prefer:        met === "POST" ? "return=minimal" : ""
    }
  };
  if (data && (met === "POST" || met === "PATCH")) opt.body = JSON.stringify(data);

  try {
    const r = await fetch(url, opt);
    if (!r.ok) {
      console.error("DBG-02E Supabase:", await r.text());
      return { data: null, error: r.status };
    }
    return { data: met === "POST" ? [] : await r.json(), error: null };
  } catch (e) {
    console.error("DBG-02F Supabase fetch fail", e);
    return { data: null, error: e };
  }
}

const isFlip = t => t && t.startsWith("http") && t.includes("flipkart.com");
const pInt   = s => parseInt((s || "").replace(/[^0-9]/g, "")) || 0;

/* ╔════════════════════════════════════════════════════╗
   ║ 2. HTTP ENTRY                                      ║
   ╚════════════════════════════════════════════════════╝ */

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    console.log(`[${BOT_VERSION}] ${req.method} ${u.pathname}`);

    if (req.method === "GET"  && u.pathname === HEALTH)
      return new Response(`${BOT_VERSION} OK`);

    if (req.method === "POST" && u.pathname === WEBHOOK)
      return handleUpdate(await req.json().catch(()=>({})), env);

    if (req.method === "GET"  && u.pathname === TEST) {
      const { error } = await supa(env, "product_tracking", "GET", null, "limit=1");
      return new Response(error ? "DBG-03E Supabase" : "DBG-03 OK",
                          { status: error ? 500 : 200 });
    }

    if (req.method === "POST" && u.pathname === CRON)
      return cronPriceCheck(env);

    return new Response("Not found", { status: 404 });
  }
};

/* ╔════════════════════════════════════════════════════╗
   ║ 3. TELEGRAM UPDATE HANDLER                         ║
   ╚════════════════════════════════════════════════════╝ */

async function handleUpdate(upd, env) {
  try {
    const msg   = upd.message || upd.callback_query?.message;
    const cId   = msg?.chat?.id;
    const uId   = msg?.from?.id || upd.callback_query?.from?.id;
    const text  = msg?.text || "";
    const cb    = upd.callback_query?.data;

    if (!cId) return new Response("ok");
    if (cb)    return handleCallback(upd, env);

    if (text.startsWith("/start"))  return sendWelcome(cId, env.TG_BOT_TOKEN);
    if (text.startsWith("/stats"))  return showStats(cId, env);
    if (text.startsWith("/list"))   return showList(cId, uId, env);
    if (isFlip(text))               return handleFlipkart(cId, text, uId, env);

    await tgSend(env.TG_BOT_TOKEN, { chat_id: cId, text: "Send a Flipkart product link." });
    return new Response("ok");
  } catch (e) {
    console.error("DBG-04E update error", e);
    return new Response("ok");
  }
}

/* ╔════════════════════════════════════════════════════╗
   ║ 4. FLIPKART PRICE HANDLER                          ║
   ╚════════════════════════════════════════════════════╝ */

async function handleFlipkart(cId, url, uId, env) {
  await tgSend(env.TG_BOT_TOKEN, { chat_id: cId, text: "DBG-05 Fetching price…" });

  const dup = await getExisting(uId, url, env);
  if (dup) {
    await tgSend(env.TG_BOT_TOKEN, {
      chat_id: cId,
      text:    `DBG-05A Already tracking ID ${dup.tracking_id} (₹${dup.current_price})`
    });
    return;
  }

  const lam = await callLambda(env, { action: "check_price", url, chat_id: cId });
  if (!lam.success || !lam.price) {
    await tgSend(env.TG_BOT_TOKEN, {
      chat_id: cId,
      text:    `DBG-05B Lambda failed: ${lam.error || "no price"}`
    });
    return;
  }

  const tId = await saveTrack(uId, cId, url, lam, env);

  const kb = {
    inline_keyboard: [
      [{ text: "🛑 Stop",   callback_data: `stop_${tId}` },
       { text: "🔄 Refresh",callback_data: `refresh_${tId}` }],
      [{ text: "📊 History",callback_data: `hist_${tId}` }]
    ]
  };

  await tgSend(env.TG_BOT_TOKEN, {
    chat_id: cId,
    text:    `DBG-05C Price ₹${lam.price} stored. Tracking ID ${tId}`,
    reply_markup: JSON.stringify(kb)
  });
}

/* helper: duplicate */
async function getExisting(uId, url, env) {
  const enc = encodeURIComponent(url);
  const { data } = await supa(
    env, "product_tracking", "GET", null,
    `user_id=eq.${uId}&product_url=eq.${enc}&active=eq.true&limit=1`
  );
  return data && data.length ? data[0] : null;
}

/* helper: insert row */
async function saveTrack(uId, cId, url, lam, env) {
  const tid = "trk_" + Date.now().toString(36);
  await supa(env, "product_tracking", "POST", {
    tracking_id:   tid,
    user_id:       uId,
    chat_id:       cId,
    product_url:   url,
    product_title: lam.title || "Flipkart product",
    current_price: pInt(lam.price),
    last_price:    pInt(lam.price),
    active: true
  });
  return tid;
}

/* ╔════════════════════════════════════════════════════╗
   ║ 5. CALLBACK BUTTONS                                ║
   ╚════════════════════════════════════════════════════╝ */

async function handleCallback(upd, env) {
  const data  = upd.callback_query.data;
  const cId   = upd.callback_query.message.chat.id;
  const mId   = upd.callback_query.message.message_id;
  const token = env.TG_BOT_TOKEN;

  if (data.startsWith("stop_"))   return stopTrack(data.slice(5), cId, token, env);
  if (data.startsWith("refresh_"))return refreshPrice(data.slice(8), cId, token, env);
  if (data.startsWith("hist_"))   return showHistory(data.slice(5), cId, token, env);

  await tgSend(token, { chat_id: cId, text: "Unknown action." });
  return new Response("ok");
}

async function stopTrack(tid, cId, tok, env) {
  await supa(env, "product_tracking", "PATCH", { active: false },
             `tracking_id=eq.${tid}`);
  await tgSend(tok, { chat_id: cId, text: `Tracking ${tid} stopped.` });
  return new Response("ok");
}

async function refreshPrice(tid, cId, tok, env) {
  const { data } = await supa(env, "product_tracking", "GET", null,
                              `tracking_id=eq.${tid}&limit=1`);
  if (!data || !data.length) {
    await tgSend(tok, { chat_id: cId, text: "Tracking not found." });
    return new Response("ok");
  }
  const row = data[0];
  const lam = await callLambda(env, { action: "check_price", url: row.product_url, chat_id: cId });
  if (lam.success && lam.price) {
    await tgEdit(tok, {
      chat_id:    cId,
      message_id: upd.callback_query.message.message_id,
      text:       `Current Flipkart price: ₹${lam.price}`
    });
  } else {
    await tgSend(tok, { chat_id: cId, text: `Refresh failed: ${lam.error}` });
  }
  return new Response("ok");
}

async function showHistory(tid, cId, tok, env) {
  const { data } = await supa(env, "price_history", "GET", null,
                              `tracking_id=eq.${tid}&order=checked_at.desc&limit=5`);
  if (!data) {
    await tgSend(tok, { chat_id: cId, text: "No history." });
    return new Response("ok");
  }
  const lines = data.map(r => `${r.checked_at.split("T")[0]}  ₹${r.price}`).join("\n");
  await tgSend(tok, { chat_id: cId, text: `Last 5 checks for ${tid}\n${lines}` });
  return new Response("ok");
}

/* ╔════════════════════════════════════════════════════╗
   ║ 6. CRON JOB                                        ║
   ╚════════════════════════════════════════════════════╝ */

async function cronPriceCheck(env) {
  const { data } = await supa(env, "product_tracking", "GET", null, "active=eq.true");
  if (!data || !data.length) return new Response("no rows");

  let chk = 0, chg = 0;
  for (const p of data) {
    chk++;
    const lam = await callLambda(env, { action: "check_price", url: p.product_url, chat_id: 0 });
    if (lam.success && lam.price) {
      const np = pInt(lam.price);
      if (np !== p.current_price) {
        chg++;
        await supa(env, "product_tracking", "PATCH",
                   { last_price: p.current_price, current_price: np },
                   `tracking_id=eq.${p.tracking_id}`);
        await tgSend(env.TG_BOT_TOKEN, {
          chat_id: p.chat_id,
          text: `Price change!  ₹${p.current_price} → ₹${np}`
        });
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  return new Response(`cron done, checked ${chk}, changes ${chg}`);
}

/* ╔════════════════════════════════════════════════════╗
   ║ 7. SIMPLE COMMAND RESPONSES                        ║
   ╚════════════════════════════════════════════════════╝ */

async function sendWelcome(cId, tok) {
  await tgSend(tok, { chat_id: cId,
    text: "Welcome! Send me any Flipkart product URL and I'll track its real price." });
  return new Response("ok");
}

async function showStats(cId, env) {
  const { data } = await supa(env, "product_tracking", "GET", null, "");
  const msg = data ? `Total tracked products: ${data.length}` : "Stats unavailable.";
  await tgSend(env.TG_BOT_TOKEN, { chat_id: cId, text: msg });
  return new Response("ok");
}

async function showList(cId, uId, env) {
  const { data } = await supa(env, "product_tracking", "GET", null,
                              `user_id=eq.${uId}&active=eq.true`);
  if (!data || !data.length) {
    await tgSend(env.TG_BOT_TOKEN, { chat_id: cId, text: "No active trackings." });
    return new Response("ok");
  }
  const lines = data.map(r => `${r.tracking_id}  ₹${r.current_price}`).join("\n");
  await tgSend(env.TG_BOT_TOKEN, { chat_id: cId, text: lines });
  return new Response("ok");
}
