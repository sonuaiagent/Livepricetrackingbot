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
    console.log("DBG-01A Calling Lambda with:", body);
    const res = await fetch(env.AWS_LAMBDA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    console.log("DBG-01B Lambda response status:", res.status);
    const json = await res.json();
    console.log("DBG-01C Lambda response:", json);
    return json;
  } catch (e) {
    console.error("DBG-01E Lambda error:", e);
    return { success: false, error: "DBG-01E " + e.message };
  }
}

// Helper: send Telegram message
async function tgSend(token, payload) {
  try {
    console.log("DBG-02A Sending TG message:", payload);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log("DBG-02B TG response status:", res.status);
    return res;
  } catch (e) {
    console.error("DBG-02E TG send error:", e);
    return null;
  }
}

// Helper: Supabase query
async function supabaseQuery(env, table, method, data = null, query = "") {
  try {
    console.log("DBG-03A Supabase query:", { table, method, query });
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
    if (data && (method === "POST" || method === "PATCH")) {
      options.body = JSON.stringify(data);
    }

    const res = await fetch(url, options);
    console.log("DBG-03B Supabase response status:", res.status);
    
    if (!res.ok) {
      const text = await res.text();
      console.error("DBG-03E Supabase error:", text);
      return { data: null, error: { status: res.status, message: text } };
    }
    
    const json = method === "POST" ? [] : await res.json();
    console.log("DBG-03C Supabase success:", json);
    return { data: json, error: null };
  } catch (e) {
    console.error("DBG-03F Supabase fetch failed:", e);
    return { data: null, error: e };
  }
}

// Utility functions
const isFlipkartUrl = (txt) => txt && txt.startsWith("http") && txt.includes("flipkart.com");
const parsePrice = (str) => parseInt((str || "").replace(/[^0-9]/g, "")) || 0;

// Main Worker export
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    console.log(`DBG-00A [${BOT_VERSION}] ${request.method} ${url.pathname}`);

    // Health check
    if (request.method === "GET" && url.pathname === HEALTH_PATH) {
      console.log("DBG-00B Health check requested");
      return new Response(`DBG-00 Health check OK ${BOT_VERSION}`, { status: 200 });
    }

    // Webhook handler
    if (request.method === "POST" && url.pathname === WEBHOOK_PATH) {
      console.log("DBG-00C Webhook received");
      let update;
      try {
        update = await request.json();
        console.log("DBG-00D Webhook JSON:", update);
      } catch (e) {
        console.error("DBG-00E Failed reading webhook json:", e);
        return new Response("DBG-00E Bad JSON", { status: 400 });
      }
      return handleUpdate(update, env);
    }

    // Supabase test
    if (request.method === "GET" && url.pathname === TEST_PATH) {
      console.log("DBG-00F Testing Supabase");
      const { error } = await supabaseQuery(env, "product_tracking", "GET", null, "limit=1");
      if (error) {
        return new Response(`DBG-04E Supabase connectivity error: ${JSON.stringify(error)}`, { status: 500 });
      }
      return new Response("DBG-04 Supabase OK", { status: 200 });
    }

    // Cron handler
    if (request.method === "POST" && url.pathname === CRON_PATH) {
      console.log("DBG-00G Cron triggered");
      return handlePriceCheck(env);
    }

    console.log("DBG-00H Unknown route");
    return new Response("DBG-05 Unknown route", { status: 404 });
  },
};

// Handle Telegram updates
async function handleUpdate(update, env) {
  try {
    console.log("DBG-06A Processing update");
    const msg = update.message || update.callback_query?.message;
    const chatId = msg?.chat?.id;
    const userId = msg?.from?.id || update.callback_query?.from?.id;
    const text = msg?.text || "";
    const cbData = update.callback_query?.data;

    console.log("DBG-06B Update details:", { chatId, userId, text, cbData });

    if (!chatId) {
      console.error("DBG-06C No chat id in message");
      return new Response("DBG-06C No chat id", { status: 200 });
    }

    if (cbData) {
      console.log("DBG-06D Processing callback");
      return handleCallbackQuery(update, env);
    }

    if (text.startsWith("/start")) {
      console.log("DBG-06E Processing /start");
      await sendWelcomeMessage(chatId, env.TG_BOT_TOKEN);
    } else if (text.startsWith("/list")) {
      console.log("DBG-06F Processing /list");
      await showUserTrackings(chatId, userId, env);
    } else if (text.startsWith("/stats")) {
      console.log("DBG-06G Processing /stats");
      await showBotStats(chatId, env);
    } else if (isFlipkartUrl(text)) {
      console.log("DBG-06H Processing Flipkart URL");
      await handleFlipkartURLRealPriceOnly(chatId, text, userId, env);
    } else {
      console.log("DBG-06I Unrecognized message");
      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "DBG-07 Send me a Flipkart product URL to track prices!"
      });
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("DBG-06J HandleUpdate error:", e);
    await tgSend(env.TG_BOT_TOKEN, {
      chat_id: update?.message?.chat?.id || 0,
      text: `DBG-08E Exception: ${e.message}`
    });
    return new Response("DBG-08E Error in update handler", { status: 500 });
  }
}

// Check if product is already being tracked
async function checkExistingTracking(userId, url, env) {
  console.log("DBG-09A Checking existing tracking");
  const encoded = encodeURIComponent(url);
  const { data, error } = await supabaseQuery(
    env,
    "product_tracking",
    "GET",
    null,
    `user_id=eq.${userId}&product_url=eq.${encoded}&active=eq.true&limit=1`
  );
  
  if (error || !data || data.length === 0) {
    console.log("DBG-09B No existing tracking found");
    return null;
  }
  
  console.log("DBG-09C Existing tracking found:", data[0]);
  return data[0];
}

// Save product tracking to database
async function saveProductTracking(userId, chatId, url, productData, env) {
  console.log("DBG-10A Saving product tracking");
  const trackingId = `track_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const currentPrice = parsePrice(productData.sellingPrice);
  
  const { error } = await supabaseQuery(env, "product_tracking", "POST", {
    tracking_id: trackingId,
    user_id: Number(userId),
    chat_id: Number(chatId),
    product_url: url,
    product_title: productData.title,
    current_price: currentPrice,
    last_price: currentPrice,
    active: true,
  });
  
  if (error) {
    console.error("DBG-10E Failed to save tracking data:", error);
    throw new Error("DBG-10E Failed to save tracking data");
  }
  
  console.log("DBG-10B Product tracking saved:", trackingId);
  return trackingId;
}

// Handle Flipkart URL processing
async function handleFlipkartURLRealPriceOnly(chatId, url, userId, env) {
  try {
    console.log("DBG-11A Starting price extraction for:", url);
    
    await tgSend(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: "DBG-11A Starting price extraction..."
    });

    const existing = await checkExistingTracking(userId, url, env);
    if (existing) {
      console.log("DBG-11B Product already being tracked");
      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: `DBG-11B Already tracking (ID: ${existing.tracking_id}, Price: ₹${existing.current_price || 'unknown'})`
      });
      return;
    }

    console.log("DBG-11C Calling Lambda for price extraction");
    const lambdaResult = await callLambda(env, {
      action: "check_price",
      url,
      chat_id: chatId
    });

    if (!lambdaResult.success || !lambdaResult.price) {
      console.error("DBG-11D Lambda failed or no price:", lambdaResult);
      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: `DBG-11D Lambda failed: ${lambdaResult.error || 'unknown error'}`
      });
      return;
    }

    console.log("DBG-11E Lambda success, saving tracking");
    const productData = {
      title: lambdaResult.title || "Flipkart Product",
      sellingPrice: lambdaResult.price,
    };

    const tid = await saveProductTracking(userId, chatId, url, productData, env);
    
    console.log("DBG-11F Tracking saved, sending success message");
    await tgSend(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: `DBG-11F Price extracted and tracking started: ₹${productData.sellingPrice}, ID: ${tid}`
    });
    
  } catch (e) {
    console.error("DBG-11G Error in price extraction:", e);
    await tgSend(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: `DBG-11G Exception: ${e.message}`
    });
  }
}

// Handle price checking cron job
async function handlePriceCheck(env) {
  try {
    console.log("DBG-12A Starting cron price check");
    const { data } = await supabaseQuery(env, "product_tracking", "GET", null, "active=eq.true");
    
    if (!data || !data.length) {
      console.log("DBG-12B No active products to check");
      return new Response("DBG-12B No active products", { status: 200 });
    }

    console.log(`DBG-12C Checking ${data.length} products`);
    let checked = 0;
    let changed = 0;
    
    for (const product of data) {
      checked++;
      console.log(`DBG-12D Checking product ${checked}/${data.length}: ${product.tracking_id}`);
      
      try {
        const lambdaRes = await callLambda(env, {
          action: "check_price",
          url: product.product_url,
          chat_id: 0
        });
        
        if (lambdaRes.success && lambdaRes.price) {
          const newPrice = parsePrice(lambdaRes.price);
          if (newPrice !== product.current_price) {
            changed++;
            console.log(`DBG-12E Price changed for ${product.tracking_id}: ${product.current_price} -> ${newPrice}`);
            
            await supabaseQuery(env, "product_tracking", "PATCH", {
              last_price: product.current_price,
              current_price: newPrice,
              updated_at: new Date().toISOString(),
            }, `tracking_id=eq.${product.tracking_id}`);

            await tgSend(env.TG_BOT_TOKEN, {
              chat_id: product.chat_id,
              text: `DBG-12E Price Change: ${product.product_title} from ₹${product.current_price} to ₹${newPrice}`
            });
          }
        }
      } catch (innerErr) {
        console.error(`DBG-12F Error checking product ${product.tracking_id}:`, innerErr);
      }
      
      await new Promise(r => setTimeout(r, 2000));
    }

    const result = `DBG-12G Checked ${checked} products, ${changed} price changes`;
    console.log(result);
    return new Response(result, { status: 200 });
  } catch (error) {
    console.error("DBG-12H Cron error:", error);
    return new Response("DBG-12H Cron failed", { status: 500 });
  }
}

// Handle callback query buttons
async function handleCallbackQuery(update, env) {
  try {
    console.log("DBG-13A Processing callback query");
    const data = update.callback_query.data;
    const chatId = update.callback_query.message.chat.id;
    const token = env.TG_BOT_TOKEN;

    console.log("DBG-13B Callback data:", data);

    if (data.startsWith("stop_tracking_")) {
      const tid = data.substring(14);
      console.log("DBG-13C Stopping tracking:", tid);
      await supabaseQuery(env, "product_tracking", "PATCH", { active: false }, `tracking_id=eq.${tid}`);
      await tgSend(token, { chat_id: chatId, text: `DBG-13C Tracking stopped: ${tid}` });
      return new Response("ok");
    }

    if (data.startsWith("price_history_")) {
      const tid = data.substring(14);
      console.log("DBG-13D Getting price history:", tid);
      const { data: historyData } = await supabaseQuery(env, "price_history", "GET", null, `tracking_id=eq.${tid}&order=checked_at.desc&limit=5`);
      
      if (!historyData || !historyData.length) {
        await tgSend(token, { chat_id: chatId, text: "DBG-13D No price history found." });
        return new Response("ok");
      }
      
      const histLines = historyData.map(r => `${r.checked_at.split('T')[0]}: ₹${r.price}`).join("\n");
      await tgSend(token, { chat_id: chatId, text: `DBG-13D Price History:\n${histLines}` });
      return new Response("ok");
    }

    if (data.startsWith("refresh_price_")) {
      const tid = data.substring(14);
      console.log("DBG-13E Refreshing price:", tid);
      const { data: trackData } = await supabaseQuery(env, "product_tracking", "GET", null, `tracking_id=eq.${tid}&limit=1`);
      
      if (!trackData || !trackData.length) {
        await tgSend(token, { chat_id: chatId, text: "DBG-13E Tracking not found." });
        return new Response("ok");
      }
      
      const row = trackData[0];
      const lam = await callLambda(env, { action: "check_price", url: row.product_url, chat_id: chatId });
      
      if (lam.success && lam.price) {
        await tgSend(token, { chat_id: chatId, text: `DBG-13E Price refreshed: ₹${lam.price}` });
      } else {
        await tgSend(token, { chat_id: chatId, text: `DBG-13E Refresh failed: ${lam.error}` });
      }
      return new Response("ok");
    }

    console.log("DBG-13F Unknown callback action");
    await tgSend(token, { chat_id: chatId, text: "DBG-13F Unknown callback action." });
    return new Response("ok");
  } catch (error) {
    console.error("DBG-13G Callback error:", error);
    return new Response("ok");
  }
}

// Send welcome message
async function sendWelcomeMessage(chatId, token) {
  console.log("DBG-14A Sending welcome message");
  await tgSend(token, {
    chat_id: chatId,
    text: "DBG-14A Welcome! Send me Flipkart product URLs to track prices."
  });
  return new Response("ok");
}

// Show user's tracking list
async function showUserTrackings(chatId, userId, env) {
  console.log("DBG-15A Getting user trackings");
  const { data } = await supabaseQuery(env, "product_tracking", "GET", null, `user_id=eq.${userId}&active=eq.true`);
  
  if (!data || !data.length) {
    await tgSend(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: "DBG-15A You have no active trackings."
    });
    return new Response("ok");
  }
  
  const listText = data.map(r => `${r.tracking_id}: ₹${r.current_price}`).join("\n");
  await tgSend(env.TG_BOT_TOKEN, {
    chat_id: chatId,
    text: `DBG-15A Your trackings:\n${listText}`
  });
  return new Response("ok");
}

// Show bot statistics
async function showBotStats(chatId, env) {
  console.log("DBG-16A Getting bot stats");
  const { data } = await supabaseQuery(env, "product_tracking", "GET", null, "active=eq.true");
  const count = data ? data.length : 0;
  
  await tgSend(env.TG_BOT_TOKEN, {
    chat_id: chatId,
    text: `DBG-16A Total tracked products: ${count}`
  });
  return new Response("ok");
}
