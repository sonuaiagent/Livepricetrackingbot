// Version and deployment tracking
const BOT_VERSION = "2.1.0";
const DEPLOYMENT_ID = `dep-${Date.now()}`;
const BUILD_TIME = new Date().toISOString();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Log deployment info on every request (helps identify active version)
    console.log(`🚀 Bot Version: ${BOT_VERSION} | Deployment: ${DEPLOYMENT_ID} | Built: ${BUILD_TIME}`);
    console.log(`📍 Request: ${request.method} ${url.pathname} from ${request.cf?.country || 'Unknown'}`);

    if (request.method === "POST" && url.pathname === "/webhook") {
      const update = await request.json().catch(() => ({}));
      return handleUpdate(update, env);
    }

    // Enhanced health check response
    const healthResponse = `✅ Livepricetrackingbot Worker Active
🔹 Version: ${BOT_VERSION}
🔹 Deployment ID: ${DEPLOYMENT_ID}
🔹 Built: ${BUILD_TIME}
🔹 Status: Running`;

    return new Response(healthResponse, { 
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'X-Bot-Version': BOT_VERSION,
        'X-Deployment-ID': DEPLOYMENT_ID
      }
    });
  }
};

async function handleUpdate(update, env) {
  try {
    const msg = update.message || update.edited_message;
    const chatId = msg?.chat?.id;
    const userId = msg?.from?.id;
    const messageText = msg?.text || "";
    
    if (!chatId) return new Response("ok", { status: 200 });

    // Enhanced logging with version info
    console.log(`📨 [v${BOT_VERSION}] Message from user ${userId} in chat ${chatId}: "${messageText}"`);
    console.log(`🕒 Processing at: ${new Date().toISOString()}`);

    if (messageText.startsWith('/start')) {
      console.log(`🟢 [v${BOT_VERSION}] Handling /start command`);
      await sendWelcomeMessage(chatId, env.TG_BOT_TOKEN);
    } else if (isProductURL(messageText)) {
      console.log(`🛒 [v${BOT_VERSION}] Processing product URL: ${messageText.substring(0, 50)}...`);
      await handleProductURL(chatId, messageText, env.TG_BOT_TOKEN, env);
    } else {
      console.log(`ℹ️ [v${BOT_VERSION}] Sending help message for unrecognized input`);
      await sendHelpMessage(chatId, env.TG_BOT_TOKEN);
    }

    console.log(`✅ [v${BOT_VERSION}] Successfully processed message for chat ${chatId}`);
    return new Response("ok", { status: 200 });
    
  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Error in handleUpdate:`, error);
    return new Response("err", { status: 200 });
  }
}

async function sendWelcomeMessage(chatId, token) {
  console.log(`📤 [v${BOT_VERSION}] Sending welcome message to chat ${chatId}`);
  
  const welcomeText = `🤖 *Livepricetrackingbot Online* ✅

Welcome! I'm your price tracking assistant.

📱 *How to use:*
1. Send me an Amazon or Flipkart product link
2. I'll extract product details and current price
3. Get notified about price changes

🔗 *Supported platforms:*
• Amazon India (amazon.in)
• Flipkart (flipkart.com)

✨ *Example:*
Just paste: https://www.amazon.in/product-link
Or: https://www.flipkart.com/product-link

🔧 *Bot Version:* ${BOT_VERSION}
🕒 *Last Updated:* ${BUILD_TIME.split('T')[0]}

Ready to track some prices! 🚀`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: welcomeText,
    parse_mode: "Markdown"
  });
}

async function sendHelpMessage(chatId, token) {
  console.log(`📤 [v${BOT_VERSION}] Sending help message to chat ${chatId}`);
  
  const helpText = `❓ *How to use Price Tracker:*

📝 *Instructions:*
• Send me a product URL from Amazon.in or Flipkart.com
• I'll fetch the current price and product details

🔗 *Supported URLs:*
✅ https://www.amazon.in/...
✅ https://amazon.in/...
✅ https://www.flipkart.com/...
✅ https://flipkart.com/...

🔧 *Debug Info:*
• Version: ${BOT_VERSION}
• Deployment: ${DEPLOYMENT_ID}

*Example:* Just paste any product link and I'll get started! 📊`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: helpText,
    parse_mode: "Markdown"
  });
}

function isProductURL(text) {
  const amazonRegex = /https?://(www.)?amazon.in/[^s]+/i;
  const flipkartRegex = /https?://(www.)?flipkart.com/[^s]+/i;
  
  const result = amazonRegex.test(text) || flipkartRegex.test(text);
  console.log(`🔍 [v${BOT_VERSION}] URL detection for "${text.substring(0, 30)}...": ${result}`);
  
  return result;
}

async function handleProductURL(chatId, url, token, env) {
  try {
    console.log(`🛒 [v${BOT_VERSION}] Starting product processing for: ${url}`);
    
    // Send processing message
    await tgSendMessage(token, {
      chat_id: chatId,
      text: "🔍 *Processing your product link...*

Please wait while I fetch the details! ⏳",
      parse_mode: "Markdown"
    });

    // Determine platform
    const isAmazon = url.includes('amazon.in');
    const isFlipkart = url.includes('flipkart.com');
    
    console.log(`🏪 [v${BOT_VERSION}] Platform detected - Amazon: ${isAmazon}, Flipkart: ${isFlipkart}`);
    
    let productInfo;
    if (isAmazon) {
      console.log(`🛍️ [v${BOT_VERSION}] Scraping Amazon product...`);
      productInfo = await scrapeAmazonProduct(url);
    } else if (isFlipkart) {
      console.log(`🛍️ [v${BOT_VERSION}] Scraping Flipkart product...`);
      productInfo = await scrapeFlipkartProduct(url);
    } else {
      throw new Error("Unsupported platform");
    }

    console.log(`📦 [v${BOT_VERSION}] Product scraped successfully:`, productInfo);

    // Send product details
    const productText = `📦 *Product Found!*

🏷️ *Name:* ${productInfo.title}

💰 *Current Price:* ₹${productInfo.price}

🛒 *Platform:* ${productInfo.platform}

🔗 *Link:* [View Product](${url})

📊 *Tracking Status:* Active
🔔 *Notifications:* Enabled

🔧 *Processed by Bot v${BOT_VERSION}*
🕒 *Scraped at:* ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}

*I'll monitor this product for price changes!* 📈📉`;

    await tgSendMessage(token, {
      chat_id: chatId,
      text: productText,
      parse_mode: "Markdown"
    });

    // Store product data
    await storeProductData(chatId, url, productInfo, env);

  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Error processing product URL:`, error);
    
    const errorText = `❌ *Error Processing Product*

Sorry, I couldn't fetch the product details right now.

🔄 *Please try:*
• Check if the URL is correct
• Make sure it's from Amazon.in or Flipkart.com
• Try again in a few moments

🔧 *Error logged in Bot v${BOT_VERSION}*
*Tip: Copy the full product URL from your browser!* 📋`;

    await tgSendMessage(token, {
      chat_id: chatId,
      text: errorText,
      parse_mode: "Markdown"
    });
  }
}

async function scrapeAmazonProduct(url) {
  try {
    console.log(`🌐 [v${BOT_VERSION}] Fetching Amazon page...`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    console.log(`📡 [v${BOT_VERSION}] Amazon response status: ${response.status}`);
    
    const html = await response.text();
    
    // Basic extraction
    const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>(.*?)</span>/s);
    const priceMatch = html.match(/₹([0-9,]+)/);
    
    const result = {
      title: titleMatch ? titleMatch[1].trim().substring(0, 100) + "..." : "Amazon Product",
      price: priceMatch ? priceMatch[1].replace(/,/g, '') : "Price not found",
      platform: "Amazon India",
      url: url,
      timestamp: new Date().toISOString(),
      scrapedBy: `Bot v${BOT_VERSION}`
    };
    
    console.log(`✅ [v${BOT_VERSION}] Amazon scraping completed:`, result);
    return result;
    
  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Amazon scraping error:`, error);
    return {
      title: "Amazon Product",
      price: "Unable to fetch",
      platform: "Amazon India",
      url: url,
      timestamp: new Date().toISOString(),
      scrapedBy: `Bot v${BOT_VERSION}`,
      error: error.message
    };
  }
}

async function scrapeFlipkartProduct(url) {
  try {
    console.log(`🌐 [v${BOT_VERSION}] Fetching Flipkart page...`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    console.log(`📡 [v${BOT_VERSION}] Flipkart response status: ${response.status}`);
    
    const html = await response.text();
    
    // Basic extraction for Flipkart
    const titleMatch = html.match(/<span[^>]*class="B_NuCI"[^>]*>(.*?)</span>/s);
    const priceMatch = html.match(/₹([0-9,]+)/);
    
    const result = {
      title: titleMatch ? titleMatch[1].trim().substring(0, 100) + "..." : "Flipkart Product",
      price: priceMatch ? priceMatch[1].replace(/,/g, '') : "Price not found",
      platform: "Flipkart",
      url: url,
      timestamp: new Date().toISOString(),
      scrapedBy: `Bot v${BOT_VERSION}`
    };
    
    console.log(`✅ [v${BOT_VERSION}] Flipkart scraping completed:`, result);
    return result;
    
  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Flipkart scraping error:`, error);
    return {
      title: "Flipkart Product",
      price: "Unable to fetch",
      platform: "Flipkart", 
      url: url,
      timestamp: new Date().toISOString(),
      scrapedBy: `Bot v${BOT_VERSION}`,
      error: error.message
    };
  }
}

async function storeProductData(chatId, url, productInfo, env) {
  console.log(`💾 [v${BOT_VERSION}] Storing product data for chat ${chatId}:`, {
    chatId,
    url,
    productInfo,
    timestamp: new Date().toISOString(),
    storedBy: `Bot v${BOT_VERSION}`
  });
  
  // TODO: Implement actual storage using Cloudflare KV or external database
}

async function tgSendMessage(token, payload) {
  const api = `https://api.telegram.org/bot${token}/sendMessage`;
  
  console.log(`📤 [v${BOT_VERSION}] Sending message to Telegram API:`, {
    chat_id: payload.chat_id,
    text_length: payload.text?.length || 0,
    parse_mode: payload.parse_mode
  });
  
  try {
    const response = await fetch(api, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const result = await response.text();
    console.log(`📨 [v${BOT_VERSION}] Telegram API response status: ${response.status}`);
    console.log(`📨 [v${BOT_VERSION}] Telegram API response:`, result);
    return result;
    
  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Error sending message to Telegram:`, error);
    throw error;
  }
}
