// livepricetrackingbot - Cloudflare Worker
// Version 10.0.0-LAMBDA-Debug

const BOT_VERSION = "10.0.0-LAMBDA-Debug";
const HEALTH_PATH = "/health";
const WEBHOOK_PATH = "/webhook";
const TEST_PATH = "/test";
const CRON_PATH = "/cron";

// Helper: call AWS Lambda
async function callLambda(env, body) {
  try {
    const response = await fetch(env.AWS_LAMBDA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    console.log("DBG-01 Lambda response", json);
    return json;
  } catch (error) {
    console.error("DBG-01E Lambda error", error);
    return { success: false, error: "DBG-01E " + error.message };
  }
}

// Helper: send Telegram message
async function tgSendMessage(token, payload) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.text();
}

// Helper: Supabase query
async function supabaseQuery(env, table, method, data = null, query = "") {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}${query ? "?" + query : ""}`;
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      Prefer: method === "POST" ? "return=minimal" : "",
    },
  };
  if (data && (method === "POST" || method === "PATCH")) options.body = JSON.stringify(data);

  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const txt = await res.text();
      console.error("DBG-02E Supabase error", txt);
      return { data: null, error: { status: res.status, message: txt } };
    }
    const json = method === "POST" ? [] : await res.json();
    return { data: json, error: null };
  } catch (error) {
    console.error("DBG-02F Supabase fetch failed", error);
    return { data: null, error };
  }
}

const isFlipkartURL = (text) => text && text.startsWith("http") && text.includes("flipkart.com");
const parsePrice = (str) => parseInt((str || "").replace(/[^0-9]/g, "")) || 0;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    console.log(`[${BOT_VERSION}] ${request.method} ${url.pathname}`);

    if (request.method === "GET" && url.pathname === HEALTH_PATH) {
      return new Response(`${BOT_VERSION} running`, { status: 200 });
    }

    if (request.method === "POST" && url.pathname === WEBHOOK_PATH) {
      const update = await request.json().catch(() => ({}));
      return handleUpdate(update, env);
    }

    if (request.method === "GET" && url.pathname === TEST_PATH) {
      const { error } = await supabaseQuery(env, "product_tracking", "GET", null, "limit=1");
      if (error) {
        return new Response(`DBG-03E Supabase ${error.message}`, { status: 500 });
      } else {
        return new Response("DBG-03 OK", { status: 200 });
      }
    }

    if (request.method === "POST" && url.pathname === CRON_PATH) {
      return handlePriceCheck(env);
    }

    return new Response("404", { status: 404 });
  }
};

async function handleUpdate(update, env) {
  try {
    const msg = update.message || update.callback_query?.message;
    const chatId = msg?.chat?.id;
    const userId = msg?.from?.id || update.callback_query?.from?.id;
    const messageText = msg?.text || "";
    const callbackData = update.callback_query?.data;

    if (!chatId) return new Response("ok", { status: 200 });
    if (callbackData) return handleCallbackQuery(update, env);

    if (messageText.startsWith("/start")) {
      await sendWelcomeMessage(chatId, env.TG_BOT_TOKEN);
    } else if (messageText.startsWith("/list")) {
      await showUserTrackings(chatId, userId, env);
    } else if (messageText.startsWith("/stats")) {
      await showBotStats(chatId, env);
    } else if (isFlipkartURL(messageText)) {
      await handleFlipkartURLRealPriceOnly(chatId, messageText, userId, env);
    } else {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "Send me a Flipkart product URL to fetch real prices!"
      });
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("DBG-04E Handler error:", error);
    return new Response("ok", { status: 200 });
  }
}

async function checkExistingTracking(userId, url, env) {
  const encoded = encodeURIComponent(url);
  const { data, error } = await supabaseQuery(
    env,
    "product_tracking",
    "GET",
    null,
    `user_id=eq.${userId}&product_url=eq.${encoded}&active=eq.true&limit=1`
  );
  if (error || !data || data.length === 0) return null;
  return data[0];
}

async function saveProductTracking(userId, chatId, url, productData, env) {
  const trackingId = `track_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const currentPrice = parsePrice(productData.sellingPrice);
  const { error } = await supabaseQuery(env, "product_tracking", "POST", {
    tracking_id: trackingId,
    user_id: Number(userId),
    chat_id: Number(chatId),
    product_url: url,
    product_title: productData.title,
    current_price: currentPrice,
    last_price: currentPrice,
    active: true
  });
  if (error) throw new Error("DBG-06E Failed to save tracking data");
  return trackingId;
}

async function handleFlipkartURLRealPriceOnly(chatId, url, userId, env) {
  try {
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: `Real Price Extraction Started\nTarget: Flipkart product page\nMethod: Delegated AWS Lambda scraping\nResult: Real price or no tracking\nAttempting to fetch actual price...`
    });

    const existing = await checkExistingTracking(userId, url, env);
    if (existing) {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: `Already Tracking\nID: ${existing.tracking_id}\nPrice: ₹${existing.current_price?.toLocaleString() || 'Monitoring'}`
      });
      return;
    }

    const lambdaResult = await callLambda(env, { action: "check_price", url, chat_id: chatId });

    if (lambdaResult.success && lambdaResult.price) {
      const productData = {
        title: lambdaResult.title || "Flipkart Product",
        sellingPrice: lambdaResult.price
      };

      const trackingId = await saveProductTracking(userId, chatId, url, productData, env);

      const keyboard = {
        inline_keyboard: [
          [
            { text: "Buy Now", url },
            { text: "Stop Tracking", callback_data: `stop_tracking_${trackingId}` }
          ],
          [
            { text: "Price History", callback_data: `price_history_${trackingId}` },
            { text: "Refresh Price", callback_data: `refresh_price_${trackingId}` }
          ]
        ]
      };

      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id,
        text: `Price extracted:\n${productData.title}\nPrice: ₹${productData.sellingPrice}\nTracking ID: ${trackingId}\nTracking status active.`,
        parse_mode: "Markdown",
        reply_markup: JSON.stringify(keyboard)
      });
    } else {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id,
        text: `Failed to extract price:\nError: ${lambdaResult.error || 'Lambda error'}`
      });
    }
  } catch (error) {
    console.error("DBG-05E Real price extraction error", error);
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id,
      text: `Processing error: ${error.message}`
    });
  }
}

async function handlePriceCheck(env) {
  try {
    const { data } = await supabaseQuery(env, "product_tracking", "GET", null, "active=eq.true");
    if (!data || !data.length) return new Response("DBG-07 No active products", { status: 200 });

    let checked = 0;
    let changed = 0;

    for (const product of data) {
      checked++;
      try {
        const lambdaRes = await callLambda(env, { action: "check_price", url: product.product_url, chat_id: 0 });
        if (lambdaRes.success && lambdaRes.price) {
          const newPrice = parsePrice(lambdaRes.price);
          if (newPrice !== product.current_price) {
            changed++;
            await supabaseQuery(env, "product_tracking", "PATCH", {
              last_price: product.current_price,
              current_price: newPrice,
              updated_at: new Date().toISOString(),
            }, `tracking_id=eq.${product.tracking_id}`);

            await tgSendMessage(env.TG_BOT_TOKEN, {
              chat_id: product.chat_id,
              text: `Price Change Detected\nProduct: ${product.product_title}\nOld: ₹${product.current_price}\nNew: ₹${newPrice}`
            });
          }
        }
      } catch (innerError) {
        console.error(`DBG-07E Cron error for ${product.tracking_id}:`, innerError);
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    return new Response(`DBG-07 Checked ${checked} products, changes ${changed}`, { status: 200 });
  } catch (error) {
    console.error("DBG-07E Cron error:", error);
    return new Response("DBG-07E Cron failed", { status: 500 });
  }
}

async function handleCallbackQuery(update, env) {
  const data = update.callback_query.data;
  const chatId = update.callback_query.message.chat.id;
  const messageId = update.callback_query.message.message_id;
  const token = env.TG_BOT_TOKEN;

  if (data.startsWith("stop_tracking_")) {
    const trackingId = data.substring(14);
    await supabaseQuery(env, "product_tracking", "PATCH", { active: false }, `tracking_id=eq.${trackingId}`);
    await tgSendMessage(token, { chat_id: chatId, text: `Stopped tracking ${trackingId}` });
    return new Response("ok");
  }

  if (data.startsWith("price_history_")) {
    const trackingId = data.substring(14);
    const { data } = await supabaseQuery(env, "price_history", "GET", null, `tracking_id=eq.${trackingId}&order=checked_at.desc&limit=5`);
    if (!data || !data.length) {
      await tgSendMessage(token, { chat_id: chatId, text: "No price history found." });
      return new Response("ok");
    }
    const historyText = data.map(r => `${r.checked_at.split("T")[0]}: ₹${r.price}`).join("\n");
    await tgSendMessage(token, { chat_id: chatId, text: `Price history for ${trackingId}:\n${historyText}` });
    return new Response("ok");
  }

  if (data.startsWith("refresh_price_")) {
    const trackingId = data.substring(14);
    const { data } = await supabaseQuery(env, "product_tracking", "GET", null, `tracking_id=eq.${trackingId}&limit=1`);
    if (!data || !data.length) {
      await tgSendMessage(token, { chat_id: chatId, text: "Tracking not found." });
      return new Response("ok");
    }
    const row = data[0];
    const lam = await callLambda(env, { action: "check_price", url: row.product_url, chat_id: chatId });
    if (lam.success && lam.price) {
      await tgSendMessage(token, { chat_id: chatId, text: `Refreshed price: ₹${lam.price}` });
    } else {
      await tgSendMessage(token, { chat_id: chatId, text: `Refresh failed: ${lam.error}` });
    }
    return new Response("ok");
  }

  await tgSendMessage(token, { chat_id: chatId, text: "Unknown action." });
  return new Response("ok");
}

async function sendWelcomeMessage(chatId, token) {
  await tgSendMessage(token, { chat_id: chatId, text: "Welcome! Send me Flipkart links to track prices." });
  return new Response("ok");
}

async function showUserTrackings(chatId, userId, env) {
  const { data } = await supabaseQuery(env, "product_tracking", "GET", null, `user_id=eq.${userId}&active=eq.true`);
  if (!data || !data.length) {
    await tgSendMessage(env.TG_BOT_TOKEN, { chat_id: chatId, text: "You have no active trackings." });
    return new Response("ok");
  }
  const listText = data.map(r => `${r.tracking_id}  ₹${r.current_price}`).join("\n");
  await tgSendMessage(env.TG_BOT_TOKEN, { chat_id: chatId, text: `Your active trackings:\n${listText}` });
  return new Response("ok");
}

async function showBotStats(chatId, env) {
  const { data } = await supabaseQuery(env, "product_tracking", "GET", null);
  const count = data ? data.length : 0;
  await tgSendMessage(env.TG_BOT_TOKEN, { chat_id: chatId, text: `Total tracked products: ${count}` });
  return new Response("ok");
}

/* End of worker.js */
