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

async function testSupabaseConnection(env) {
  try {
    const { data, error } = await supabaseQuery(env, "product_tracking", "GET", null, "limit=1");
    if (error) {
      return new Response(`❌ Supabase Error: ${JSON.stringify(error)}`, { status: 500 });
    }
    return new Response(`✅ Supabase Connected Successfully!
Tables accessible: Yes
Data count: ${data?.length || 0}
Connection: Active
Ready for production!`, { status: 200 });
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

    console.log(`📨 Message from user ${userId}: "${messageText.substring(0, 50)}..."`);

    if (callbackData) {
      return handleCallbackQuery(update, env);
    }

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
    console.error(`❌ Error in handleUpdate:`, error);
    return new Response("err", { status: 200 });
  }
}

async function handleCallbackQuery(update, env) {
  const callbackQuery = update.callback_query;
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  try {
    if (data.startsWith("stop_tracking_")) {
      const trackingId = data.replace("stop_tracking_", "");
      const success = await stopTracking(trackingId, env);
      const responseText = success
        ? "🛑 *Tracking Stopped Successfully*\n\nYou will no longer receive price alerts for this product.\n\nUse /list to see your remaining tracked products."
        : "❌ *Error stopping tracking*\n\nPlease try again or contact support.";

      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: responseText,
        parse_mode: "Markdown",
      });
    } else if (data.startsWith("price_history_")) {
      const trackingId = data.replace("price_history_", "");
      await showPriceHistory(chatId, trackingId, env);
    } else if (data.startsWith("refresh_price_")) {
      const trackingId = data.replace("refresh_price_", "");
      await refreshSinglePrice(chatId, trackingId, env);
    }

    // Always answer callback query to remove loading state
    await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQuery.id }),
    });
  } catch (error) {
    console.error("Callback error:", error);
  }
  return new Response("ok", { status: 200 });
}

async function handleFlipkartURL(chatId, url, userId, env) {
  try {
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: `🔍 *Processing your Flipkart product...*\n\n• Extracting product details\n• Setting up price monitoring\n• Preparing notifications\n\n⏳ *Please wait...*`,
      parse_mode: "Markdown",
    });

    const productInfo = await scrapeFlipkartAdvanced(url);

    if (!productInfo.success) {
      throw new Error("Failed to extract product information");
    }

    const existingTrack = await checkExistingTracking(userId, url, env);
    if (existingTrack) {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: `⚠️ *Product Already Tracked*\n\nYou're already tracking this product!\n\n🆔 **Tracking ID:** \`${existingTrack.tracking_id}\`\n\nUse /list to see all your tracked products.`,
        parse_mode: "Markdown",
      });
      return;
    }

    const trackingId = await saveProductTracking(userId, chatId, url, productInfo, env);

    const keyboard = {
      inline_keyboard: [
        [
          { text: "✅ Buy Now", url },
          { text: "🛑 Stop Tracking", callback_data: `stop_tracking_${trackingId}` },
        ],
        [
          { text: "📊 Price History", callback_data: `price_history_${trackingId}` },
          { text: "🔄 Refresh Price", callback_data: `refresh_price_${trackingId}` },
        ],
      ],
    };

    const productText = formatAdvancedProductMessage(productInfo, trackingId);

    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: productText,
      parse_mode: "Markdown",
      reply_markup: JSON.stringify(keyboard),
    });

    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: `✅ *The Product has Started Tracking!*\n\nNow you can sit back and relax! I will send you an alert when the price of this product changes!\n\n📊 Use /list to see all your tracked products.\n🔔 Price checks happen every 30 minutes automatically.`,
      parse_mode: "Markdown",
    });
  } catch (error) {
    console.error(`❌ Error in handleFlipkartURL:`, error);
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: `❌ *Unable to Process Product*\n\nSorry, I couldn't fetch the product details.\n\n🔄 *Possible reasons:*\n• Product page structure changed\n• Network connectivity issues\n• Anti-scraping protection\n\nPlease try again with a different Flipkart product link.`,
      parse_mode: "Markdown",
    });
  }
}

// --- Other Functions like showUserTrackings, showBotStats, refreshSinglePrice etc. remain similar, ensure full details from prior code ---

// Enhanced Flipkart scraping with dynamic User-Agent cycling to mimic browsers
async function scrapeFlipkartAdvanced(url) {
  try {
    console.log(`🌐 Fetching Flipkart page: ${url}`);

    // Rotate user agents to mimic real browsers, reduces chance of blocking
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:111.0) Gecko/20100101 Firefox/111.0",
    ];
    const ua = userAgents[Math.floor(Math.random() * userAgents.length)];

    const response = await fetch(url, {
      headers: {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.flipkart.com/",
        "Cache-Control": "no-cache",
        // Additional headers imitating browser behavior
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`📡 Flipkart page loaded: ${html.length} chars`);

    let productData = {
      title: "Flipkart Product",
      sellingPrice: "Not available",
      success: false,
    };

    // Possible title selectors to increase robustness
    const titlePatterns = ["B_NuCI", "_35KyD6", "yhB1nd", "_4rR01T", "x-product-title-label"];
    for (const pattern of titlePatterns) {
      const idx = html.indexOf(pattern);
      if (idx > -1) {
        const section = html.substring(idx, idx + 1000);
        const spanStart = section.indexOf(">");
        const spanEnd = section.indexOf("</span>");
        if (spanStart > -1 && spanEnd > spanStart) {
          let title = section.substring(spanStart + 1, spanEnd).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
          if (title.length > 5 && !title.includes("Flipkart")) {
            productData.title = title.length > 120 ? title.substring(0, 120) + "..." : title;
            productData.success = true;
            console.log(`✅ Title found: ${productData.title.substring(0, 50)}...`);
            break;
          }
        }
      }
    }

    // Price extraction patterns
    const pricePatterns = [
      /₹([0-9,]+)/g,
      /"price":"₹([0-9,]+)"/g,
      /price[^>]*>.*?₹([0-9,]+)/gi,
      /_30jeq3[^>]*>.*?₹([0-9,]+)/gi,
    ];
    const pricesFound = [];
    for (const pattern of pricePatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && pricesFound.length < 10) {
        const priceVal = match[1].replace(/,/g, "");
        if (priceVal && !isNaN(priceVal) && parseFloat(priceVal) > 0) {
          pricesFound.push(match[1]);
        }
      }
    }
    if (pricesFound.length > 0) {
      productData.sellingPrice = pricesFound[0];
      console.log(`✅ Price found: ₹${productData.sellingPrice}`);
    }

    productData.timestamp = new Date().toISOString();
    productData.url = url;

    console.log(`🎯 Final data: ${productData.success ? "Success" : "Partial"} - ₹${productData.sellingPrice}`);

    return productData;
  } catch (error) {
    console.error(`❌ Scraping error:`, error);
    return {
      title: "Flipkart Product",
      sellingPrice: "Unable to fetch",
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      url,
    };
  }
}

// ... Other existing functions like supabaseQuery, generateTrackingId, parsePrice, isFlipkartURL, tgSendMessage stay unchanged but fully integrated.
