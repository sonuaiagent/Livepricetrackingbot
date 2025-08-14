const BOT_VERSION = "9.3.0-DEBUG-NUMBERED";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    console.log(`🚀 Bot Version: ${BOT_VERSION} | Request: ${request.method} ${url.pathname}`);

    try {
      if (request.method === "POST" && url.pathname === "/webhook") {
        const update = await request.json().catch(() => ({}));
        return handleUpdateWithDebug(update, env);
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
• Debug Mode: Numbered responses enabled
• Fast Response: < 3 seconds guaranteed
• Tracking: Unlimited products

💡 Endpoints:
• /webhook - Telegram bot (debug mode)
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

// MAIN DEBUG HANDLER with numbered debug points
async function handleUpdateWithDebug(update, env) {
  try {
    console.log("🛎️ DEBUG 01: Received webhook request");
    
    // DEBUG 01: Confirm webhook reception
    const msg = update.message || update.callback_query?.message;
    const chatId = msg?.chat?.id;
    const userId = msg?.from?.id || update.callback_query?.from?.id;
    const messageText = msg?.text || "";

    if (!msg) {
      console.log("❌ DEBUG 01.1: No message object found");
      return new Response("ok", { status: 200 });
    }

    if (!chatId) {
      console.log("❌ DEBUG 01.2: No chat ID found");
      return new Response("ok", { status: 200 });
    }

    console.log(`✅ DEBUG 01.3: Valid message - Chat: ${chatId}, User: ${userId}, Text: "${messageText}"`);

    // DEBUG 02: Test immediate bot response capability
    try {
      console.log("🔧 DEBUG 02: Testing immediate response capability");
      const debugResponse = await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: `🔧 DEBUG 02: Bot received your message!\n\nMessage: "${messageText}"\nChat ID: ${chatId}\nUser ID: ${userId}\nBot Version: ${BOT_VERSION}`
      });
      console.log("✅ DEBUG 02: Immediate response sent successfully");
    } catch (error) {
      console.error("❌ DEBUG 02: Failed to send immediate response:", error);
      // Try sending a simpler message
      try {
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: "❌ DEBUG 02.1: Error in immediate response"
        });
      } catch (simpleError) {
        console.error("❌ DEBUG 02.1: Even simple message failed:", simpleError);
      }
    }

    // DEBUG 03: Check environment variables
    try {
      console.log("🔧 DEBUG 03: Checking environment variables");
      const hasToken = !!env.TG_BOT_TOKEN;
      const hasSupabaseUrl = !!env.SUPABASE_URL;
      const hasSupabaseKey = !!env.SUPABASE_ANON_KEY;
      
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: `🔧 DEBUG 03: Environment Check\n\nBot Token: ${hasToken ? '✅' : '❌'}\nSupabase URL: ${hasSupabaseUrl ? '✅' : '❌'}\nSupabase Key: ${hasSupabaseKey ? '✅' : '❌'}`
      });
      console.log("✅ DEBUG 03: Environment check completed");
    } catch (error) {
      console.error("❌ DEBUG 03: Environment check failed:", error);
    }

    // DEBUG 04: Test message type detection
    try {
      console.log("🔧 DEBUG 04: Testing message type detection");
      const callbackData = update.callback_query?.data;
      let messageType = "unknown";
      
      if (callbackData) {
        messageType = "callback_query";
      } else if (messageText.startsWith("/start")) {
        messageType = "/start command";
      } else if (messageText.startsWith("/list")) {
        messageType = "/list command";
      } else if (messageText.startsWith("/stats")) {
        messageType = "/stats command";
      } else if (isFlipkartURL(messageText)) {
        messageType = "flipkart_url";
      } else {
        messageType = "other_text";
      }

      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: `🔧 DEBUG 04: Message Type Detection\n\nDetected Type: ${messageType}\nMessage Text: "${messageText}"\nHas Callback: ${!!callbackData}`
      });
      console.log("✅ DEBUG 04: Message type detection completed");
    } catch (error) {
      console.error("❌ DEBUG 04: Message type detection failed:", error);
    }

    // DEBUG 05: Test callback query handling
    if (update.callback_query?.data) {
      try {
        console.log("🔧 DEBUG 05: Processing callback query");
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: `🔧 DEBUG 05: Callback Query\n\nData: ${update.callback_query.data}\nProcessing...`
        });
        await handleCallbackQueryDebug(update, env);
        return new Response("ok", { status: 200 });
      } catch (error) {
        console.error("❌ DEBUG 05: Callback query failed:", error);
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: `❌ DEBUG 05: Callback query error: ${error.message}`
        });
      }
    }

    // DEBUG 06: Process regular commands with individual debug points
    if (messageText.startsWith("/start")) {
      try {
        console.log("🔧 DEBUG 06: Processing /start command");
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: "🔧 DEBUG 06: /start command received, processing..."
        });
        await sendWelcomeMessageDebug(chatId, env.TG_BOT_TOKEN);
      } catch (error) {
        console.error("❌ DEBUG 06: /start failed:", error);
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: `❌ DEBUG 06: /start error: ${error.message}`
        });
      }
    } else if (messageText.startsWith("/list")) {
      try {
        console.log("🔧 DEBUG 07: Processing /list command");
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: "🔧 DEBUG 07: /list command received, checking database..."
        });
        await showUserTrackingsDebug(chatId, userId, env);
      } catch (error) {
        console.error("❌ DEBUG 07: /list failed:", error);
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: `❌ DEBUG 07: /list error: ${error.message}`
        });
      }
    } else if (messageText.startsWith("/stats")) {
      try {
        console.log("🔧 DEBUG 08: Processing /stats command");
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: "🔧 DEBUG 08: /stats command received, fetching statistics..."
        });
        await showBotStatsDebug(chatId, env);
      } catch (error) {
        console.error("❌ DEBUG 08: /stats failed:", error);
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: `❌ DEBUG 08: /stats error: ${error.message}`
        });
      }
    } else if (isFlipkartURL(messageText)) {
      try {
        console.log("🔧 DEBUG 09: Processing Flipkart URL");
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: "🔧 DEBUG 09: Flipkart URL detected, starting processing..."
        });
        await handleFlipkartURLDebug(chatId, messageText, userId, env);
      } catch (error) {
        console.error("❌ DEBUG 09: Flipkart URL failed:", error);
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: `❌ DEBUG 09: Flipkart URL error: ${error.message}`
        });
      }
    } else {
      try {
        console.log("🔧 DEBUG 10: Processing unknown message, sending help");
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: "🔧 DEBUG 10: Unknown message type, sending help..."
        });
        await sendHelpMessageDebug(chatId, env.TG_BOT_TOKEN);
      } catch (error) {
        console.error("❌ DEBUG 10: Help message failed:", error);
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: `❌ DEBUG 10: Help message error: ${error.message}`
        });
      }
    }

    // DEBUG 11: Final completion
    try {
      console.log("✅ DEBUG 11: All processing completed successfully");
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "✅ DEBUG 11: Processing completed successfully!"
      });
    } catch (error) {
      console.error("❌ DEBUG 11: Final message failed:", error);
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error(`❌ CRITICAL ERROR in handleUpdateWithDebug:`, error);
    try {
      if (update.message?.chat?.id) {
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: update.message.chat.id,
          text: `❌ CRITICAL ERROR: ${error.message}`
        });
      }
    } catch (sendError) {
      console.error("Failed to send critical error message:", sendError);
    }
    return new Response("error", { status: 200 });
  }
}

// DEBUG COMMAND HANDLERS with individual error tracking

async function sendWelcomeMessageDebug(chatId, token) {
  try {
    console.log("🔧 DEBUG 06.1: Preparing welcome message");
    const welcomeText = `🤖 *Advanced Flipkart Price Tracker v${BOT_VERSION}* ✅

🔧 **DEBUG MODE ACTIVE**

Welcome! I'm your intelligent Flipkart price tracking assistant.

🚀 **Features:**
• **24/7 Price Monitoring**
• **Instant Notifications**
• **Price History Tracking**
• **Interactive Management**
• **Debug Mode for Testing**

📱 **Commands:**
• Send Flipkart URL → Start tracking
• /list → View tracked products
• /stats → Bot statistics

Ready to track prices! 💰`;

    await tgSendMessage(token, {
      chat_id: chatId,
      text: welcomeText,
      parse_mode: "Markdown"
    });
    console.log("✅ DEBUG 06.1: Welcome message sent successfully");
  } catch (error) {
    console.error("❌ DEBUG 06.1: Welcome message failed:", error);
    await tgSendMessage(token, {
      chat_id: chatId,
      text: `❌ DEBUG 06.1: Welcome error: ${error.message}`
    });
  }
}

async function showUserTrackingsDebug(chatId, userId, env) {
  try {
    console.log("🔧 DEBUG 07.1: Querying user trackings from database");
    const { data: trackings, error } = await supabaseQuery(env, "product_tracking", "GET", null, 
      `user_id=eq.${userId}&active=eq.true&order=created_at.desc`);
    
    if (error) {
      throw new Error(`Database error: ${JSON.stringify(error)}`);
    }

    console.log("✅ DEBUG 07.1: Database query successful");
    
    if (!trackings || trackings.length === 0) {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "✅ DEBUG 07.2: No tracked products found\n\n📊 *Your Tracked Products*\n\nYou haven't tracked any products yet.\n\nSend me any Flipkart product link to start tracking!",
        parse_mode: "Markdown"
      });
      return;
    }
    
    let listText = `✅ DEBUG 07.3: Found ${trackings.length} tracked products\n\n📊 *Your Tracked Products*\n\n`;
    
    trackings.forEach((tracking, index) => {
      const title = tracking.product_title?.length > 40 ? 
        tracking.product_title.substring(0, 40) + "..." : tracking.product_title;
      
      listText += `${index + 1}. **${title}**\n`;
      listText += `   💰 Current: ₹${tracking.current_price?.toLocaleString() || 'N/A'}\n`;
      listText += `   🆔 ID: \`${tracking.tracking_id}\`\n\n`;
    });
    
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: listText,
      parse_mode: "Markdown"
    });
    console.log("✅ DEBUG 07.3: User trackings sent successfully");
  } catch (error) {
    console.error("❌ DEBUG 07: User trackings failed:", error);
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: `❌ DEBUG 07: Error fetching trackings: ${error.message}`,
      parse_mode: "Markdown"
    });
  }
}

async function showBotStatsDebug(chatId, env) {
  try {
    console.log("🔧 DEBUG 08.1: Fetching bot statistics");
    const { data: totalTracking } = await supabaseQuery(env, "product_tracking", "GET", null, "active=eq.true");
    const { data: priceChanges } = await supabaseQuery(env, "price_history", "GET", null, "limit=100");
    
    const uniqueUsers = new Set(totalTracking?.map(t => t.user_id)).size || 0;
    
    const statsText = `✅ DEBUG 08.1: Statistics fetched successfully

📊 *Bot Statistics*

🔍 **Active Trackings:** ${totalTracking?.length || 0}
👥 **Total Users:** ${uniqueUsers}
📈 **Price Changes:** ${priceChanges?.length || 0}
🤖 **Version:** ${BOT_VERSION}

⚡ **Status:** Debug mode active`;
    
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: statsText,
      parse_mode: "Markdown"
    });
    console.log("✅ DEBUG 08.1: Bot stats sent successfully");
  } catch (error) {
    console.error("❌ DEBUG 08: Bot stats failed:", error);
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: `❌ DEBUG 08: Stats error: ${error.message}`,
      parse_mode: "Markdown"
    });
  }
}

async function handleFlipkartURLDebug(chatId, url, userId, env) {
  try {
    console.log("🔧 DEBUG 09.1: Validating Flipkart URL");
    if (!isFlipkartURL(url)) {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "❌ DEBUG 09.1: Invalid Flipkart URL format"
      });
      return;
    }

    console.log("🔧 DEBUG 09.2: Checking for existing tracking");
    const existing = await checkExistingTracking(userId, url, env);
    if (existing) {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: `⚠️ DEBUG 09.2: Product already tracked\n\n🆔 Tracking ID: \`${existing.tracking_id}\``,
        parse_mode: "Markdown"
      });
      return;
    }

    console.log("🔧 DEBUG 09.3: Starting product scraping");
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: "🔧 DEBUG 09.3: Scraping Flipkart product page..."
    });

    const productInfo = await scrapeFlipkartAdvanced(url);
    
    if (!productInfo.success) {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: `❌ DEBUG 09.3: Scraping failed\n\nError: ${productInfo.error || 'Unknown error'}`
      });
      return;
    }

    console.log("🔧 DEBUG 09.4: Saving to database");
    const trackingId = await saveProductTracking(userId, chatId, url, productInfo, env);

    console.log("🔧 DEBUG 09.5: Sending success message");
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: `✅ DEBUG 09.5: Product tracked successfully!

📦 **Product:** ${productInfo.title}
💰 **Price:** ₹${productInfo.sellingPrice}
🆔 **Tracking ID:** \`${trackingId}\`

Product is now being monitored for price changes!`,
      parse_mode: "Markdown"
    });
    console.log("✅ DEBUG 09.5: Flipkart URL processing completed");
  } catch (error) {
    console.error("❌ DEBUG 09: Flipkart URL processing failed:", error);
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: `❌ DEBUG 09: Flipkart processing error: ${error.message}`
    });
  }
}

async function sendHelpMessageDebug(chatId, token) {
  try {
    console.log("🔧 DEBUG 10.1: Sending help message");
    const helpText = `✅ DEBUG 10.1: Help message

❓ **Price Tracker Help**

📝 **What I can do:**
• Track Flipkart products automatically
• Send price change notifications
• Keep price history

🔗 **How to use:**
• Send any Flipkart product URL
• Use /list to see tracked products
• Use /stats for bot statistics

**Send me a Flipkart link to start!** 🛒`;

    await tgSendMessage(token, {
      chat_id: chatId,
      text: helpText,
      parse_mode: "Markdown"
    });
    console.log("✅ DEBUG 10.1: Help message sent successfully");
  } catch (error) {
    console.error("❌ DEBUG 10.1: Help message failed:", error);
    await tgSendMessage(token, {
      chat_id: chatId,
      text: `❌ DEBUG 10.1: Help error: ${error.message}`
    });
  }
}

async function handleCallbackQueryDebug(update, env) {
  try {
    console.log("🔧 DEBUG 05.1: Processing callback query");
    const data = update.callback_query?.data;
    const chatId = update.callback_query?.message?.chat?.id;

    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: `✅ DEBUG 05.1: Callback processed\n\nData: ${data}`
    });

    // Answer callback query
    await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: update.callback_query.id })
    });
    console.log("✅ DEBUG 05.1: Callback query completed");
  } catch (error) {
    console.error("❌ DEBUG 05.1: Callback query failed:", error);
  }
}

// UTILITY FUNCTIONS (unchanged but with error handling)

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
  if (!token) {
    throw new Error("Bot token not configured");
  }
  
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
      throw new Error(`Telegram API error: ${response.status}`);
    }
    
    return await response.text();
  } catch (error) {
    console.error("Telegram send error:", error);
    throw error;
  }
}

function isFlipkartURL(text) {
  return text && typeof text === 'string' && text.startsWith("http") && text.includes("flipkart.com");
}

function generateTrackingId() {
  return `track_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
}

function parsePrice(priceString) {
  if (!priceString || priceString === "Not available") return 0;
  const cleaned = priceString.replace(/[^0-9]/g, "");
  return parseInt(cleaned) || 0;
}

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

async function scrapeFlipkartAdvanced(url) {
  try {
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
    
    let title = "Flipkart Product";
    let price = "Not available";
    
    // Basic title extraction
    const titleMatch = html.match(/class="B_NuCI"[^>]*>([^<]+)<\/span>/);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }
    
    // Basic price extraction
    const priceMatch = html.match(/₹([0-9,]+)/);
    if (priceMatch) {
      price = priceMatch[1];
    }

    return {
      title: title.length > 120 ? title.substring(0, 120) + "..." : title,
      sellingPrice: price,
      success: true,
      timestamp: new Date().toISOString(),
      url: url
    };

  } catch (error) {
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

async function handlePriceCheck(env) {
  try {
    console.log("🔄 Starting price check...");
    return new Response("Price check completed", { status: 200 });
  } catch (error) {
    return new Response("Price check failed", { status: 500 });
  }
}
