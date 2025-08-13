// Advanced Flipkart Price Tracker v9.0.0-SUPABASE-INTEGRATED
const BOT_VERSION = "9.0.0-SUPABASE-INTEGRATED";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    console.log(`🚀 Bot Version: ${BOT_VERSION} | Request: ${request.method} ${url.pathname}`);

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
  }
};

async function testSupabaseConnection(env) {
  try {
    const { data, error } = await supabaseQuery(env, 'product_tracking', 'GET', null, 'limit=1');
    
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
    const callbackData = update.callback_query?.data;
    const chatId = msg?.chat?.id;
    const userId = msg?.from?.id || update.callback_query?.from?.id;
    const messageText = msg?.text || "";
    
    if (!chatId) return new Response("ok", { status: 200 });
    
    console.log(`📨 Message from user ${userId}: "${messageText.substring(0, 50)}..."`);
    
    // Handle callback buttons
    if (callbackData) {
      return handleCallbackQuery(update, env);
    }
    
    if (messageText.startsWith('/start')) {
      await sendWelcomeMessage(chatId, env.TG_BOT_TOKEN);
    } else if (messageText.startsWith('/list')) {
      await showUserTrackings(chatId, userId, env);
    } else if (messageText.startsWith('/stats')) {
      await showBotStats(chatId, env);
    } else if (isFlipkartURL(messageText)) {
      await handleFlipkartURL(chatId, messageText, userId, env);
    } else {
      await sendHelpMessage(chatId, env.TG_BOT_TOKEN);
    }
    
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error(`❌ Error:`, error);
    return new Response("err", { status: 200 });
  }
}

async function handleCallbackQuery(update, env) {
  const callbackQuery = update.callback_query;
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;
  
  try {
    if (data.startsWith('stop_tracking_')) {
      const trackingId = data.replace('stop_tracking_', '');
      const success = await stopTracking(trackingId, env);
      
      if (success) {
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: "🛑 *Tracking Stopped Successfully*\n\nYou will no longer receive price alerts for this product.\n\nUse /list to see your remaining tracked products.",
          parse_mode: "Markdown"
        });
      } else {
        await tgSendMessage(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: "❌ *Error stopping tracking*\n\nPlease try again or contact support.",
          parse_mode: "Markdown"
        });
      }
    }
    
    if (data.startsWith('price_history_')) {
      const trackingId = data.replace('price_history_', '');
      await showPriceHistory(chatId, trackingId, env);
    }
    
    if (data.startsWith('refresh_price_')) {
      const trackingId = data.replace('refresh_price_', '');
      await refreshSinglePrice(chatId, trackingId, env);
    }
    
    // Answer callback query
    await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({callback_query_id: callbackQuery.id})
    });
    
  } catch (error) {
    console.error('Callback error:', error);
  }
  
  return new Response("ok", { status: 200 });
}

async function handleFlipkartURL(chatId, url, userId, env) {
  try {
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: `🔍 *Processing your Flipkart product...*\n\n• Extracting product details\n• Setting up price monitoring\n• Preparing notifications\n\n⏳ *Please wait...*`,
      parse_mode: "Markdown"
    });

    const productInfo = await scrapeFlipkartAdvanced(url);
    
    if (!productInfo.success) {
      throw new Error("Failed to extract product information");
    }
    
    // Check if already tracking this product
    const existingTrack = await checkExistingTracking(userId, url, env);
    if (existingTrack) {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: `⚠️ *Product Already Tracked*\n\nYou're already tracking this product!\n\n🆔 **Tracking ID:** \`${existingTrack.tracking_id}\`\n\nUse /list to see all your tracked products.`,
        parse_mode: "Markdown"
      });
      return;
    }
    
    // Save to Supabase
    const trackingId = await saveProductTracking(userId, chatId, url, productInfo, env);
    
    // Create interactive buttons like in reference screenshots
    const keyboard = {
      inline_keyboard: [
        [
          {text: "✅ Buy Now", url: url},
          {text: "🛑 Stop Tracking", callback_data: `stop_tracking_${trackingId}`}
        ],
        [
          {text: "📊 Price History", callback_data: `price_history_${trackingId}`},
          {text: "🔄 Refresh Price", callback_data: `refresh_price_${trackingId}`}
        ]
      ]
    };
    
    const productText = formatAdvancedProductMessage(productInfo, trackingId);
    
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: productText,
      parse_mode: "Markdown",
      reply_markup: JSON.stringify(keyboard)
    });
    
    // Send tracking confirmation like in reference screenshots
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: `✅ *The Product has Started Tracking!*\n\nNow you can sit back and relax! I will send you an alert when the price of this product changes!\n\n📊 Use /list to see all your tracked products.\n🔔 Price checks happen every 30 minutes automatically.`,
      parse_mode: "Markdown"
    });

  } catch (error) {
    console.error(`❌ Error:`, error);
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: `❌ *Unable to Process Product*\n\nSorry, I couldn't fetch the product details.\n\n🔄 *Possible reasons:*\n• Product page structure changed\n• Network connectivity issues\n• Anti-scraping protection\n\nPlease try again with a different Flipkart product link.`,
      parse_mode: "Markdown"
    });
  }
}

async function showUserTrackings(chatId, userId, env) {
  try {
    const { data: trackings, error } = await supabaseQuery(env, 'product_tracking', 'GET', null, `user_id=eq.${userId}&active=eq.true&order=created_at.desc`);
    
    if (error) {
      throw new Error('Database query failed');
    }
    
    if (!trackings || trackings.length === 0) {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "📊 *Your Tracked Products*\n\nYou haven't tracked any products yet.\n\nSend me any Flipkart product link to start tracking!\n\n💡 **Benefits:**\n• Get instant price drop alerts\n• Track price history\n• Never miss a deal!",
        parse_mode: "Markdown"
      });
      return;
    }
    
    let listText = `📊 *Your Tracked Products* (${trackings.length})\n\n`;
    
    trackings.forEach((tracking, index) => {
      const title = tracking.product_title.length > 40 ? 
        tracking.product_title.substring(0, 40) + "..." : tracking.product_title;
      
      const daysTracking = Math.floor((new Date() - new Date(tracking.created_at)) / (1000 * 60 * 60 * 24));
      
      listText += `${index + 1}. **${title}**\n`;
      listText += `   💰 Current: ₹${tracking.current_price.toLocaleString()}\n`;
      listText += `   📅 Tracking: ${daysTracking} days\n`;
      listText += `   🆔 ID: \`${tracking.tracking_id}\`\n\n`;
    });
    
    listText += "Use the buttons on individual product messages to manage tracking.";
    
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: listText,
      parse_mode: "Markdown"
    });
    
  } catch (error) {
    console.error('Error showing trackings:', error);
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: "❌ *Error fetching your tracked products*\n\nPlease try again later.",
      parse_mode: "Markdown"
    });
  }
}

async function showBotStats(chatId, env) {
  try {
    const { data: totalTracking } = await supabaseQuery(env, 'product_tracking', 'GET', null, 'active=eq.true');
    const { data: priceChanges } = await supabaseQuery(env, 'price_history', 'GET', null, 'limit=100');
    
    const uniqueUsers = new Set(totalTracking?.map(t => t.user_id)).size || 0;
    
    const statsText = `📊 *Bot Statistics*\n\n🔍 **Active Trackings:** ${totalTracking?.length || 0}\n👥 **Total Users:** ${uniqueUsers}\n📈 **Price Changes Detected:** ${priceChanges?.length || 0}\n🤖 **Bot Version:** ${BOT_VERSION}\n\n⚡ **Status:** Fully operational\n🔄 **Monitoring:** Every 30 minutes\n💾 **Database:** Supabase connected`;
    
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

async function refreshSinglePrice(chatId, trackingId, env) {
  try {
    const { data: tracking } = await supabaseQuery(env, 'product_tracking', 'GET', null, `tracking_id=eq.${trackingId}&limit=1`);
    
    if (!tracking || tracking.length === 0) {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "❌ Product not found in tracking database.",
        parse_mode: "Markdown"
      });
      return;
    }
    
    const product = tracking[0];
    
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: "🔄 *Refreshing price...*\n\nFetching latest price data!",
      parse_mode: "Markdown"
    });
    
    const currentProductInfo = await scrapeFlipkartAdvanced(product.product_url);
    const newPrice = parsePrice(currentProductInfo.sellingPrice);
    const oldPrice = product.current_price;
    
    let statusText = `🔄 *Price Refresh Complete*\n\n🏷️ **Product:** ${product.product_title}\n\n`;
    
    if (newPrice > 0 && newPrice !== oldPrice) {
      const priceChange = newPrice - oldPrice;
      const changeText = priceChange > 0 ? "increased" : "decreased";
      const emoji = priceChange > 0 ? "📈" : "📉";
      
      statusText += `${emoji} **Price ${changeText}** by ₹${Math.abs(priceChange).toLocaleString()}\n\n`;
      statusText += `💰 **Previous:** ₹${oldPrice.toLocaleString()}\n`;
      statusText += `💰 **Current:** ₹${newPrice.toLocaleString()}\n\n`;
      
      // Update database
      await supabaseQuery(env, 'product_tracking', 'PATCH', {
        current_price: newPrice,
        last_price: oldPrice,
        updated_at: new Date().toISOString()
      }, `tracking_id=eq.${trackingId}`);
      
      // Save price history
      await supabaseQuery(env, 'price_history', 'POST', {
        tracking_id: trackingId,
        price: newPrice
      });
      
    } else if (newPrice > 0) {
      statusText += `✅ **Price unchanged:** ₹${newPrice.toLocaleString()}\n\n`;
    } else {
      statusText += `⚠️ **Unable to fetch current price**\n\n`;
    }
    
    statusText += `🕒 **Refreshed:** ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}`;
    
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: statusText,
      parse_mode: "Markdown"
    });
    
  } catch (error) {
    console.error('Price refresh error:', error);
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: "❌ *Error refreshing price*\n\nPlease try again later.",
      parse_mode: "Markdown"
    });
  }
}

// Database Operations
async function checkExistingTracking(userId, url, env) {
  const { data, error } = await supabaseQuery(env, 'product_tracking', 'GET', null, `user_id=eq.${userId}&product_url=eq.${encodeURIComponent(url)}&active=eq.true&limit=1`);
  
  if (error || !data || data.length === 0) {
    return null;
  }
  
  return data[0];
}

async function saveProductTracking(userId, chatId, url, productInfo, env) {
  const trackingId = generateTrackingId();
  const currentPrice = parsePrice(productInfo.sellingPrice);
  
  console.log(`💾 Saving to Supabase: ${trackingId}, Price: ${currentPrice}`);
  
  const { data, error } = await supabaseQuery(env, 'product_tracking', 'POST', {
    tracking_id: trackingId,
    user_id: parseInt(userId),
    chat_id: parseInt(chatId),
    product_url: url,
    product_title: productInfo.title,
    current_price: currentPrice,
    last_price: currentPrice
  });
  
  if (error) {
    console.error('Supabase save error:', error);
    throw new Error('Failed to save tracking data');
  }
  
  console.log(`✅ Saved successfully: ${trackingId}`);
  return trackingId;
}

async function stopTracking(trackingId, env) {
  const { data, error } = await supabaseQuery(env, 'product_tracking', 'PATCH', {
    active: false
  }, `tracking_id=eq.${trackingId}`);
  
  if (error) {
    console.error('Error stopping tracking:', error);
    return false;
  }
  
  return true;
}

async function showPriceHistory(chatId, trackingId, env) {
  const { data, error } = await supabaseQuery(env, 'price_history', 'GET', null, `tracking_id=eq.${trackingId}&order=recorded_at.desc&limit=15`);
  
  if (error || !data || data.length === 0) {
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text: "📊 *Price History*\n\nNo price history available yet. I'll start collecting data as prices change!\n\nPrice changes will be recorded automatically.",
      parse_mode: "Markdown"
    });
    return;
  }
  
  let historyText = "📊 *Price History* (Last 15 Records)\n\n";
  data.forEach((record, index) => {
    const date = new Date(record.recorded_at).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
    historyText += `${index + 1}. ₹${record.price.toLocaleString()} - ${date}\n`;
  });
  
  historyText += "\n📈 Price tracking happens automatically every 30 minutes.";
  
  await tgSendMessage(env.TG_BOT_TOKEN, {
    chat_id: chatId,
    text: historyText,
    parse_mode: "Markdown"
  });
}

async function handlePriceCheck(env) {
  try {
    console.log('🔄 Starting automated price check...');
    const startTime = Date.now();
    
    // Get all active trackings from Supabase
    const { data: trackings, error } = await supabaseQuery(env, 'product_tracking', 'GET', null, 'active=eq.true');
    
    if (error) {
      console.error('Failed to fetch trackings:', error);
      return new Response("Error fetching trackings", { status: 500 });
    }
    
    let checkedCount = 0;
    let notificationsSent = 0;
    let errors = 0;
    
    console.log(`📊 Found ${trackings?.length || 0} products to check`);
    
    for (const tracking of trackings || []) {
      try {
        console.log(`🔍 Checking: ${tracking.product_title.substring(0, 30)}...`);
        
        const currentProductInfo = await scrapeFlipkartAdvanced(tracking.product_url);
        const newPrice = parsePrice(currentProductInfo.sellingPrice);
        const oldPrice = tracking.current_price;
        
        checkedCount++;
        
        if (newPrice !== oldPrice && newPrice > 0) {
          // Price changed - send notification like in reference screenshots
          const priceChange = newPrice - oldPrice;
          const changeText = priceChange > 0 ? "increased" : "decreased";
          const emoji = priceChange > 0 ? "📈" : "📉";
          const alertEmoji = priceChange < 0 ? "🚨" : "📢";
          
          const notificationText = `${alertEmoji} *Price Alert!* ${emoji}\n\n🏷️ ${tracking.product_title}\n\nThe Product Price has **${changeText}** by ₹${Math.abs(priceChange).toLocaleString()}!\n\n⭐ **Previous price:** ₹${oldPrice.toLocaleString()}\n💰 **Current Price:** ₹${newPrice.toLocaleString()}\n\n🔗 [View Product](${tracking.product_url})\n\n🕒 **Updated:** ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'})}`;
          
          await tgSendMessage(env.TG_BOT_TOKEN, {
            chat_id: tracking.chat_id,
            text: notificationText,
            parse_mode: "Markdown"
          });
          
          // Update price in Supabase
          await supabaseQuery(env, 'product_tracking', 'PATCH', {
            current_price: newPrice,
            last_price: oldPrice,
            updated_at: new Date().toISOString()
          }, `tracking_id=eq.${tracking.tracking_id}`);
          
          // Save price history
          await supabaseQuery(env, 'price_history', 'POST', {
            tracking_id: tracking.tracking_id,
            price: newPrice
          });
          
          notificationsSent++;
          console.log(`📨 Alert sent: ${tracking.tracking_id} (${oldPrice} → ${newPrice})`);
        }
        
        // Small delay to avoid overwhelming Flipkart
        if (checkedCount % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`Error checking ${tracking.tracking_id}:`, error.message);
        errors++;
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const resultMessage = `✅ Price check completed in ${duration}s: ${checkedCount} products checked, ${notificationsSent} notifications sent, ${errors} errors`;
    
    console.log(resultMessage);
    return new Response(resultMessage, { status: 200 });
    
  } catch (error) {
    console.error("Price check error:", error);
    return new Response(`Price check failed: ${error.message}`, { status: 500 });
  }
}

// Supabase helper function
async function supabaseQuery(env, table, method, data = null, params = '') {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}${params ? '?' + params : ''}`;
  
  const options = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
      'Prefer': method === 'POST' ? 'return=minimal' : ''
    }
  };
  
  if (data && (method === 'POST' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }
  
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Supabase ${method} error:`, response.status, errorText);
      return { data: null, error: { status: response.status, message: errorText } };
    }
    
    const result = method === 'POST' && options.headers.Prefer === 'return=minimal' ? 
      [] : await response.json();
    
    return { data: result, error: null };
  } catch (error) {
    console.error('Supabase network error:', error);
    return { data: null, error: error.message };
  }
}

function generateTrackingId() {
  return 'track_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

function parsePrice(priceString) {
  if (!priceString || priceString === "Not available") return 0;
  const cleaned = priceString.replace(/[^0-9]/g, '');
  return parseInt(cleaned) || 0;
}

function isFlipkartURL(text) {
  const hasFlipkart = text.includes('flipkart.com');
  const isHTTP = text.startsWith('http');
  return isHTTP && hasFlipkart;
}

function formatAdvancedProductMessage(productInfo, trackingId) {
  const timestamp = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
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

// Enhanced Flipkart scraping function
async function scrapeFlipkartAdvanced(url) {
  try {
    console.log(`🌐 Fetching Flipkart page: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Referer': 'https://www.flipkart.com/'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`📡 Flipkart page loaded: ${html.length} chars`);

    let productData = {
      title: "Flipkart Product",
      sellingPrice: "Not available",
      success: false
    };

    // Enhanced title extraction
    const titlePatterns = [
      'B_NuCI',
      '_35KyD6',
      'yhB1nd',
      '_4rR01T',
      'x-product-title-label'
    ];

    for (const pattern of titlePatterns) {
      const titleIndex = html.indexOf(pattern);
      if (titleIndex > -1) {
        const titleSection = html.substring(titleIndex, titleIndex + 1000);
        const spanStart = titleSection.indexOf('>');
        const spanEnd = titleSection.indexOf('</span>');
        if (spanStart > -1 && spanEnd > spanStart) {
          const extractedTitle = titleSection.substring(spanStart + 1, spanEnd)
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (extractedTitle.length > 5 && !extractedTitle.includes('Flipkart')) {
            productData.title = extractedTitle.length > 120 ? 
              extractedTitle.substring(0, 120) + "..." : extractedTitle;
            productData.success = true;
            console.log(`✅ Title found: ${productData.title.substring(0, 50)}...`);
            break;
          }
        }
      }
    }

    // Enhanced price extraction
    const pricePatterns = [
      /₹([0-9,]+)/g,
      /"price":"₹([0-9,]+)"/g,
      /price[^>]*>.*?₹([0-9,]+)/gi,
      /_30jeq3[^>]*>.*?₹([0-9,]+)/gi
    ];

    const foundPrices = [];
    for (const pattern of pricePatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && foundPrices.length < 10) {
        const priceValue = match[1].replace(/,/g, '');
        if (priceValue && !isNaN(priceValue) && parseFloat(priceValue) > 0) {
          foundPrices.push(match[1]);
        }
      }
    }

    if (foundPrices.length > 0) {
      productData.sellingPrice = foundPrices[0];
      console.log(`✅ Price found: ₹${productData.sellingPrice}`);
    }

    productData.timestamp = new Date().toISOString();
    productData.url = url;

    console.log(`🎯 Final data: ${productData.success ? 'Success' : 'Partial'} - ₹${productData.sellingPrice}`);
    return productData;

  } catch (error) {
    console.error(`❌ Scraping error:`, error);
    return {
      title: "Flipkart Product",
      sellingPrice: "Unable to fetch", 
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      url: url
    };
  }
}

async function sendWelcomeMessage(chatId, token) {
  const welcomeText = `🤖 *Advanced Flipkart Price Tracker v${BOT_VERSION}* ✅

Welcome! I'm your intelligent Flipkart price tracking assistant.

🚀 **Enhanced Features:**
• **24/7 Price Monitoring** - Continuous automated tracking
• **Instant Notifications** - Real-time price change alerts  
• **Price History** - Track trends and patterns over time
• **Interactive Management** - Easy control with buttons
• **Unlimited Products** - Track as many products as you want
• **Smart Alerts** - Get notified only when prices actually change

📱 **How to use:**
1. Send me any Flipkart product link
2. I'll start tracking it automatically  
3. Get instant alerts when prices change
4. Use buttons to manage your tracked products

💡 **Commands:**
• Send Flipkart URL → Start tracking
• /list → View all your tracked products
• /stats → See bot statistics

Ready to save money on Flipkart deals! 💰🛒✨`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: welcomeText,
    parse_mode: "Markdown"
  });
}

async function sendHelpMessage(chatId, token) {
  const helpText = `❓ **Advanced Price Tracker Help**

📝 **What I can do:**
• Track ANY Flipkart product automatically
• Send notifications when prices change
• Keep detailed price history for analysis
• Provide easy management tools

🔗 **Supported Products:**
✅ Electronics (Mobiles, Laptops, TVs, etc.)
✅ Fashion (Clothing, Shoes, Accessories)
✅ Home & Kitchen appliances
✅ Books & Media
✅ Beauty & Personal Care
✅ **Any Flipkart product page!**

📱 **Commands:**
• Send Flipkart URL → Start tracking
• /list → See tracked products
• /stats → View bot statistics

🛠️ **Buttons available:**
• ✅ Buy Now → Direct link to product
• 🛑 Stop Tracking → Disable price monitoring
• 📊 Price History → View price trends
• 🔄 Refresh Price → Get current price

**Try it now - send me any Flipkart product link!** 🛒`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: helpText,
    parse_mode: "Markdown"
  });
}

async function tgSendMessage(token, payload) {
  if (!token) {
    throw new Error("Bot token not configured");
  }

  const api = `https://api.telegram.org/bot${token}/sendMessage`;
  
  const response = await fetch(api, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    console.error(`Telegram API error: ${response.status}`);
    const errorText = await response.text();
    console.error(`Error details: ${errorText}`);
  }
  
  return await response.text();
}
