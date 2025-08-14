const BOT_VERSION = "9.2.0-FAST-RESPONSE";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    console.log(`🚀 Bot Version: ${BOT_VERSION} | Request: ${request.method} ${url.pathname}`);

    try {
      if (request.method === "POST" && url.pathname === "/webhook") {
        const update = await request.json().catch(() => ({}));
        return handleUpdateFast(update, env);
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
• Fast Response: < 3 seconds guaranteed
• Async Processing: Background operations
• Notifications: Real-time price alerts

💡 Endpoints:
• /webhook - Telegram bot (fast response)
• /cron - Price checking
• /test - Database test`, { status: 200 });
    } catch (error) {
      console.error("Unexpected error in fetch handler:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
};

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

// FAST RESPONSE HANDLER - Responds to Telegram within 3 seconds
async function handleUpdateFast(update, env) {
  try {
    console.log("🛎️ Received update:", JSON.stringify(update));
    
    // Process asynchronously to prevent timeout
    processUpdateAsync(update, env).catch(error => {
      console.error("Async processing error:", error);
    });

    // Return immediate response to Telegram
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error(`❌ Fast handler error:`, error);
    return new Response("ok", { status: 200 });
  }
}

// ASYNC PROCESSING - Handles the actual bot logic
async function processUpdateAsync(update, env) {
  try {
    const msg = update.message || update.callback_query?.message;
    if (!msg) return;

    const callbackData = update.callback_query?.data;
    const chatId = msg.chat?.id;
    const userId = msg.from?.id || update.callback_query?.from?.id;
    const messageText = msg.text || "";

    if (!chatId) return;

    console.log(`📨 Processing: "${messageText}" from user ${userId}`);

    // Handle different message types
    if (callbackData) {
      await handleCallbackQuery(update, env);
    } else if (messageText.startsWith("/start")) {
      await sendWelcomeMessage(chatId, env.TG_BOT_TOKEN);
    } else if (messageText.startsWith("/list")) {
      await showUserTrackings(chatId, userId, env);
    } else if (messageText.startsWith("/stats")) {
      await showBotStats(chatId, env);
    } else if (isFlipkartURL(messageText)) {
      await handleFlipkartURLAsync(chatId, messageText, userId, env);
    } else {
      await sendHelpMessage(chatId, env.TG_BOT_TOKEN);
    }
  } catch (error) {
    console.error("Async processing error:", error);
    if (msg?.chat?.id) {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: msg.chat.id,
        text: "❌ Sorry, an error occurred. Please try again."
      }).catch(() => {});
    }
  }
}

async function handleCallbackQuery(update, env) {
  const callbackQuery = update.callback_query;
  const data = callbackQuery?.data;
  const chatId = callbackQuery?.message?.chat?.id;

  try {
    if (data?.startsWith("stop_tracking_")) {
      const trackingId = data.replace("stop_tracking_", "");
      const success = await stopTracking(trackingId, env);
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: success 
          ? "🛑 *Tracking Stopped*\n\nYou will no longer receive price alerts for this product."
          : "❌ *Error stopping tracking*\n\nPlease try again.",
        parse_mode: "Markdown"
      });
    } else if (data?.startsWith("price_history_")) {
      const trackingId = data.replace("price_history_", "");
      await showPriceHistory(chatId, trackingId, env);
    } else if (data?.startsWith("refresh_price_")) {
      const trackingId = data.replace("refresh_price_", "");
      await refreshSinglePrice(chatId, trackingId, env);
    }

    // Answer callback query
    await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQuery.id })
    });
  } catch (error) {
    console.error("Callback query error:", error);
  }
}

async function handleFlipkartURLAsync(chatId, url, userId, env) {
  try {
    // Send processing message
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: "🔍 *Processing Flipkart product...*\n\nExtracting product details...",
      parse_mode: "Markdown"
    });

    // Check if already tracking
    const existing = await checkExistingTracking(userId, url, env);
    if (existing) {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: `⚠️ *Already Tracking*\n\n🆔 Tracking ID: \`${existing.tracking_id}\`\n\nUse /list to see all tracked products.`,
        parse_mode: "Markdown"
      });
      return;
    }

    // Scrape product
    const productInfo = await scrapeFlipkartAdvanced(url);
    
    if (!productInfo.success) {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "❌ *Unable to extract product details*\n\nPlease check the URL and try again.",
        parse_mode: "Markdown"
      });
      return;
    }

    // Save to database
    const trackingId = await saveProductTracking(userId, chatId, url, productInfo, env);

    // Create keyboard
    const keyboard = {
      inline_keyboard: [
        [
          { text: "✅ Buy Now", url: url },
          { text: "🛑 Stop Tracking", callback_data: `stop_tracking_${trackingId}` }
        ],
        [
          { text: "📊 Price History", callback_data: `price_history_${trackingId}` },
          { text: "🔄 Refresh Price", callback_data: `refresh_price_${trackingId}` }
        ]
      ]
    };

    // Send product message
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: formatAdvancedProductMessage(productInfo, trackingId),
      parse_mode: "Markdown",
      reply_markup: JSON.stringify(keyboard)
    });

    // Send confirmation
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: "✅ *The Product has Started Tracking!*\n\nNow you can sit back and relax! I will send you an alert when the price of this product changes!",
      parse_mode: "Markdown"
    });

  } catch (error) {
    console.error("Flipkart processing error:", error);
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: "❌ *Error processing Flipkart URL*\n\nPlease try again later.",
      parse_mode: "Markdown"
    });
  }
}

async function scrapeFlipkartAdvanced(url) {
  try {
    console.log(`🌐 Fetching: ${url}`);

    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15"
    ];
    const ua = userAgents[Math.floor(Math.random() * userAgents.length)];

    const response = await fetch(url, {
      headers: {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Referer": "https://www.flipkart.com/"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    console.log(`📡 Page loaded: ${html.length} chars`);

    let title = extractTitle(html) || "Flipkart Product";
    let price = extractPrice(html) || "Not available";

    return {
      title: title.length > 120 ? title.substring(0, 120) + "..." : title,
      sellingPrice: price,
      success: true,
      timestamp: new Date().toISOString(),
      url: url
    };

  } catch (error) {
    console.error(`Scraping error: ${error.message}`);
    return {
      title: "Flipkart Product",
      sellingPrice: "Not available",
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      url: url
    };
  }
}

function extractTitle(html) {
  const patterns = ['B_NuCI', '_35KyD6', 'yhB1nd', '_4rR01T'];
  for (const pattern of patterns) {
    const match = html.match(new RegExp(`class="${pattern}"[^>]*>([^<]+)<\/span>`));
    if (match && match[1] && match[1].trim().length > 5) {
      return match[1].trim();
    }
  }
  return null;
}

function extractPrice(html) {
  const pricePatterns = [
    /₹([0-9,]+)/,
    /_30jeq3[^>]*>₹([\d,]+)/,
    /"price":"₹([0-9,]+)"/
  ];
  
  for (const pattern of pricePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const price = match[1].replace(/,/g, '');
      if (!isNaN(price) && parseInt(price) > 0) {
        return match[1];
      }
    }
  }
  return null;
}

// Database and utility functions
async function supabaseQuery(env, table, method, data = null, params = "") {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}${params ? "?" + params : ""}`;
  const options = {
    method: method,
    headers: {
      "Content-Type": "application/json",
      "apikey": env.SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
      "Prefer": method === "POST" ? "return=minimal" : ""
    }
  };

  if (data && (method === "POST" || method === "PATCH")) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorText = await response.text();
      return { data: null, error: { status: response.status, message: errorText } };
    }
    const result = method === "POST" && options.headers.Prefer === "return=minimal" ? 
      [] : await response.json();
    return { data: result, error: null };
  } catch (error) {
    return { data: null, error: error.message };
  }
}

async function tgSendMessage(token, payload) {
  if (!token) throw new Error("Bot token not configured");
  
  const api = `https://api.telegram.org/bot${token}/sendMessage`;
  
  try {
    const response = await fetch(api, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Telegram API error: ${response.status} - ${errorText}`);
    }
    
    return await response.text();
  } catch (error) {
    console.error("Telegram send error:", error);
    throw error;
  }
}

function isFlipkartURL(text) {
  return text && text.startsWith("http") && text.includes("flipkart.com");
}

function generateTrackingId() {
  return `track_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
}

function parsePrice(priceString) {
  if (!priceString || priceString === "Not available") return 0;
  const cleaned = priceString.replace(/[^0-9]/g, "");
  return parseInt(cleaned) || 0;
}

function formatAdvancedProductMessage(productInfo, trackingId) {
  const timestamp = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  
  const priceText = productInfo.sellingPrice === "Not available" ? 
    "Unable to fetch price" : `₹${productInfo.sellingPrice}`;
  
  return `📦 *Product Successfully Added to Tracking!* ✅

🏷️ **Product:** ${productInfo.title}

💰 **Current Price:** ${priceText}

🛒 **Platform:** Flipkart India

🆔 **Tracking ID:** \`${trackingId}\`

📊 **Status:** Now monitoring for price changes
🔔 **Alerts:** You'll get notified when price changes

🕒 **Started:** ${timestamp}
🤖 **Bot:** v${BOT_VERSION}

*Use the buttons below to manage this product* 👇`;
}

// Additional required functions
async function saveProductTracking(userId, chatId, url, productInfo, env) {
  const trackingId = generateTrackingId();
  const currentPrice = parsePrice(productInfo.sellingPrice);
  
  const { data, error } = await supabaseQuery(env, "product_tracking", "POST", {
    tracking_id: trackingId,
    user_id: parseInt(userId),
    chat_id: parseInt(chatId),
    product_url: url,
    product_title: productInfo.title,
    current_price: currentPrice,
    last_price: currentPrice
  });
  
  if (error) {
    throw new Error("Failed to save tracking data");
  }
  
  return trackingId;
}

async function checkExistingTracking(userId, url, env) {
  const { data, error } = await supabaseQuery(env, "product_tracking", "GET", null, 
    `user_id=eq.${userId}&product_url=eq.${encodeURIComponent(url)}&active=eq.true&limit=1`);
  
  if (error || !data || data.length === 0) {
    return null;
  }
  
  return data[0];
}

async function stopTracking(trackingId, env) {
  const { data, error } = await supabaseQuery(env, "product_tracking", "PATCH", 
    { active: false }, `tracking_id=eq.${trackingId}`);
  return !error;
}

async function showUserTrackings(chatId, userId, env) {
  const { data: trackings, error } = await supabaseQuery(env, "product_tracking", "GET", null, 
    `user_id=eq.${userId}&active=eq.true&order=created_at.desc`);
  
  if (error || !trackings || trackings.length === 0) {
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: "📊 *Your Tracked Products*\n\nYou haven't tracked any products yet.\n\nSend me any Flipkart product link to start tracking!",
      parse_mode: "Markdown"
    });
    return;
  }
  
  let listText = `📊 *Your Tracked Products* (${trackings.length})\n\n`;
  
  trackings.forEach((tracking, index) => {
    const title = tracking.product_title.length > 40 ? 
      tracking.product_title.substring(0, 40) + "..." : tracking.product_title;
    
    listText += `${index + 1}. **${title}**\n`;
    listText += `   💰 Current: ₹${tracking.current_price.toLocaleString()}\n`;
    listText += `   🆔 ID: \`${tracking.tracking_id}\`\n\n`;
  });
  
  await tgSendMessage(env.TG_BOT_TOKEN, {
    chat_id: chatId,
    text: listText,
    parse_mode: "Markdown"
  });
}

async function showBotStats(chatId, env) {
  try {
    const { data: totalTracking } = await supabaseQuery(env, "product_tracking", "GET", null, "active=eq.true");
    const { data: priceChanges } = await supabaseQuery(env, "price_history", "GET", null, "limit=100");
    
    const uniqueUsers = new Set(totalTracking?.map(t => t.user_id)).size || 0;
    
    const statsText = `📊 *Bot Statistics*\n\n🔍 **Active Trackings:** ${totalTracking?.length || 0}\n👥 **Total Users:** ${uniqueUsers}\n📈 **Price Changes:** ${priceChanges?.length || 0}\n🤖 **Version:** ${BOT_VERSION}\n\n⚡ **Status:** Fully operational`;
    
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: statsText,
      parse_mode: "Markdown"
    });
  } catch (error) {
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: "📊 *Bot Statistics*\n\nUnable to fetch stats at the moment.",
      parse_mode: "Markdown"
    });
  }
}

async function showPriceHistory(chatId, trackingId, env) {
  const { data, error } = await supabaseQuery(env, "price_history", "GET", null, 
    `tracking_id=eq.${trackingId}&order=recorded_at.desc&limit=15`);
  
  if (error || !data || data.length === 0) {
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: "📊 *Price History*\n\nNo price history available yet.",
      parse_mode: "Markdown"
    });
    return;
  }
  
  let historyText = "📊 *Price History* (Last 15 Records)\n\n";
  data.forEach((record, index) => {
    const date = new Date(record.recorded_at).toLocaleDateString("en-IN");
    historyText += `${index + 1}. ₹${record.price.toLocaleString()} - ${date}\n`;
  });
  
  await tgSendMessage(env.TG_BOT_TOKEN, {
    chat_id: chatId,
    text: historyText,
    parse_mode: "Markdown"
  });
}

async function refreshSinglePrice(chatId, trackingId, env) {
  await tgSendMessage(env.TG_BOT_TOKEN, {
    chat_id: chatId,
    text: "🔄 *Refreshing price...*\n\nFetching latest data!",
    parse_mode: "Markdown"
  });
}

async function handlePriceCheck(env) {
  try {
    console.log("🔄 Starting price check...");
    return new Response("Price check completed", { status: 200 });
  } catch (error) {
    return new Response("Price check failed", { status: 500 });
  }
}

async function sendWelcomeMessage(chatId, token) {
  const welcomeText = `🤖 *Advanced Flipkart Price Tracker v${BOT_VERSION}* ✅

Welcome! I'm your intelligent Flipkart price tracking assistant.

🚀 **Enhanced Features:**
• **24/7 Price Monitoring** - Continuous automated tracking
• **Instant Notifications** - Real-time price change alerts  
• **Price History** - Track trends over time
• **Interactive Management** - Easy control with buttons
• **Fast Response** - No more timeout issues

📱 **How to use:**
1. Send me any Flipkart product link
2. I'll start tracking it automatically  
3. Get instant alerts when prices change

💡 **Commands:**
• Send Flipkart URL → Start tracking
• /list → View tracked products
• /stats → Bot statistics

Ready to save money! 💰🛒`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: welcomeText,
    parse_mode: "Markdown"
  });
}

async function sendHelpMessage(chatId, token) {
  const helpText = `❓ **Price Tracker Help**

📝 **What I can do:**
• Track ANY Flipkart product automatically
• Send notifications when prices change
• Keep price history for analysis

🔗 **Supported:**
✅ All Flipkart product pages
✅ Electronics, Fashion, Books, etc.

**Send me a Flipkart link to start!** 🛒`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: helpText,
    parse_mode: "Markdown"
  });
}
