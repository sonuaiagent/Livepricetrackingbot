const BOT_VERSION = "9.1.0-ADVANCED";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    console.log(`🚀 Bot Version: ${BOT_VERSION} | Request: ${request.method} ${url.pathname}`);

    try {
      if (request.method === "POST" && url.pathname === "/webhook") {
        const update = await request.json().catch(() => ({}));
        return handleUpdate(update, env);
      }
      if (request.method === "POST" && url.pathname === "/cron") {
        return handlePriceCheck(env);
      }
      if (request.method === "GET" && url.pathname === "/test") {
        return testSupabaseConnection(env);
      }
      return new Response(`✅ Advanced Price Tracker v${BOT_VERSION} - Online!

🚀 Features:
• Database: Connected to Supabase
• Scheduling: GitHub Actions + cron-job.org  
• Tracking: Unlimited products
• Notifications: Real-time price alerts

💡 Endpoints:
• /webhook - Telegram bot
• /cron - Price checking
• /test - Database test`, { status: 200 });
    } catch (error) {
      console.error("Unexpected error in fetch handler:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
};

// --- Main handlers ---
async function testSupabaseConnection(env) {
  try {
    const { data, error } = await supabaseQuery(env, "product_tracking", "GET", null, "limit=1");
    if (error) {
      return new Response(`❌ Supabase Error: ${JSON.stringify(error)}`, { status: 500 });
    }
    return new Response(`✅ Supabase Connected Successfully!
Tables accessible: Yes
Data count: ${data?.length || 0}
Connection: Active`, { status: 200 });
  } catch (error) {
    return new Response(`❌ Connection Error: ${error.message}`, { status: 500 });
  }
}

async function handleUpdate(update, env) {
  try {
    const msg = update.message || update.callback_query?.message;
    if (!msg) return new Response("ok", { status: 200 });

    const callbackData = update.callback_query?.data;
    const chatId = msg.chat?.id;
    const userId = msg.from?.id || update.callback_query?.from?.id;
    const messageText = msg.text || "";

    if (!chatId) return new Response("ok", { status: 200 });

    console.log(`📨 Message from ${userId}: "${messageText}"`);

    if (callbackData) {
      return handleCallbackQuery(update, env);
    }

    // Actual command handling restored
    if (messageText.startsWith("/start")) {
      await sendWelcomeMessage(chatId, env.TG_BOT_TOKEN);
    } else if (messageText.startsWith("/list")) {
      await showUserTrackings(chatId, userId, env);
    } else if (messageText.startsWith("/stats")) {
      await showBotStats(chatId, env);
    } else if (isFlipkartURL(messageText)) {
      await handleFlipkartURL(chatId, messageText, userId, env);
    } else {
      await sendHelpMessage(chatId, env.TG_BOT_TOKEN);
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error(`❌ handleUpdate error:`, error);
    return new Response("err", { status: 200 });
  }
}

async function handleCallbackQuery(update, env) {
  const data = update.callback_query?.data;
  const chatId = update.callback_query?.message?.chat?.id;

  try {
    if (data.startsWith("stop_tracking_")) {
      const trackingId = data.replace("stop_tracking_", "");
      const success = await stopTracking(trackingId, env);
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: success
          ? "🛑 *Tracking Stopped*\nYou will no longer receive price alerts for this product."
          : "❌ *Error stopping tracking*",
        parse_mode: "Markdown"
      });
    }
    if (data.startsWith("price_history_")) {
      await showPriceHistory(chatId, data.replace("price_history_", ""), env);
    }
    if (data.startsWith("refresh_price_")) {
      await refreshSinglePrice(chatId, data.replace("refresh_price_", ""), env);
    }
    await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: update.callback_query.id })
    });
  } catch (error) {
    console.error("Callback error:", error);
  }
  return new Response("ok", { status: 200 });
}

async function handleFlipkartURL(chatId, url, userId, env) {
  try {
    await tgSendMessage(env.TG_BOT_TOKEN, { chat_id: chatId, text: "🔍 Fetching Flipkart product...", parse_mode: "Markdown" });
    const productInfo = await scrapeFlipkartAdvanced(url);
    if (!productInfo.success) throw new Error("Scrape failed");

    const existing = await checkExistingTracking(userId, url, env);
    if (existing) {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: `⚠️ *Already Tracking*\n🆔 \`${existing.tracking_id}\``,
        parse_mode: "Markdown"
      });
      return;
    }

    const trackingId = await saveProductTracking(userId, chatId, url, productInfo, env);
    const kb = {
      inline_keyboard: [
        [{ text: "✅ Buy Now", url }, { text: "🛑 Stop Tracking", callback_data: `stop_tracking_${trackingId}` }],
        [{ text: "📊 Price History", callback_data: `price_history_${trackingId}` }, { text: "🔄 Refresh Price", callback_data: `refresh_price_${trackingId}` }]
      ]
    };
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: formatAdvancedProductMessage(productInfo, trackingId),
      parse_mode: "Markdown", reply_markup: JSON.stringify(kb)
    });
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: "✅ Product is now being tracked!",
      parse_mode: "Markdown"
    });
  } catch (err) {
    console.error("Flipkart URL error:", err);
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: "❌ Error processing Flipkart link.", parse_mode: "Markdown"
    });
  }
}

// --- Scraper ---
async function scrapeFlipkartAdvanced(url) {
  try {
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1.15",
      "Mozilla/5.0 (X11; Linux x86_64) Chrome/115 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:111.0) Firefox/111.0"
    ];
    const ua = userAgents[Math.floor(Math.random()*userAgents.length)];

    const res = await fetch(url, { headers: { "User-Agent": ua, "Referer": "https://www.flipkart.com/" }});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    let title = "Flipkart Product", price = "Not available";
    const titleMatch = html.match(/class="B_NuCI"[^>]*>([^<]+)<\/span>/);
    if (titleMatch) { title = titleMatch[1].trim(); }
    const priceMatch = html.match(/_30jeq3[^>]*>₹([\d,]+)/);
    if (priceMatch) { price = priceMatch[1].replace(/,/g, ''); }

    return { title, sellingPrice: price, success: true };
  } catch (e) {
    console.error("Scrape error:", e);
    return { title: "Flipkart Product", sellingPrice: "Not available", success: false };
  }
}

// --- Supabase helpers ---
async function supabaseQuery(env, table, method, data=null, params="") {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}${params ? "?" + params : ""}`;
  const opt = { method, headers: { "Content-Type": "application/json", "apikey": env.SUPABASE_ANON_KEY, "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}` }};
  if (data && (method === "POST" || method === "PATCH")) opt.body = JSON.stringify(data);
  const res = await fetch(url, opt);
  if (!res.ok) return { error: await res.text() };
  return { data: await res.json() };
}

// --- Helpers ---
async function tgSendMessage(token, payload) {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
  });
}
function isFlipkartURL(text) { return text.startsWith("http") && text.includes("flipkart.com"); }
function formatAdvancedProductMessage(info, id) {
  return `📦 *Product Added to Tracking!* ✅\n\n🏷️ *Product:* ${info.title}\n💰 *Price:* ₹${info.sellingPrice}\n🆔 *ID:* \`${id}\`\nTracking active!`;
}
function generateTrackingId() { return `track_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }
async function saveProductTracking(userId, chatId, url, info, env) {
  const tid = generateTrackingId();
  await supabaseQuery(env, "product_tracking", "POST", { tracking_id: tid, user_id: userId, chat_id: chatId, product_url: url, product_title: info.title, current_price: parseInt(info.sellingPrice) || 0, last_price: parseInt(info.sellingPrice) || 0 });
  return tid;
}
async function checkExistingTracking(userId, url, env) {
  const { data } = await supabaseQuery(env, "product_tracking", "GET", null, `user_id=eq.${userId}&product_url=eq.${encodeURIComponent(url)}&active=eq.true`);
  return data && data[0];
}

// TODO: Implement showUserTrackings, showBotStats, stopTracking, showPriceHistory, refreshSinglePrice, handlePriceCheck similarly to your existing logic
