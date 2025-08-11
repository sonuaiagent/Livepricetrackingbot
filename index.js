// Version and deployment tracking
const BOT_VERSION = "5.0.0";
const DEPLOYMENT_ID = `dep-${Date.now()}`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    console.log(`🚀 Bot Version: ${BOT_VERSION} | Request: ${request.method} ${url.pathname}`);

    if (request.method === "POST" && url.pathname === "/webhook") {
      const update = await request.json().catch(() => ({}));
      return handleUpdate(update, env);
    }

    return new Response(`✅ Livepricetrackingbot v${BOT_VERSION} - Enhanced with Product Scraping!`, { status: 200 });
  }
};

async function handleUpdate(update, env) {
  try {
    const msg = update.message || update.edited_message;
    const chatId = msg?.chat?.id;
    const userId = msg?.from?.id;
    const messageText = msg?.text || "";
    
    if (!chatId) return new Response("ok", { status: 200 });
    
    console.log(`📨 [v${BOT_VERSION}] Message from user ${userId}: "${messageText}"`);

    if (messageText.startsWith('/start')) {
      await sendWelcomeMessage(chatId, env.TG_BOT_TOKEN);
    } else if (isProductURL(messageText)) {
      await handleProductURL(chatId, messageText, env.TG_BOT_TOKEN);
    } else {
      await sendHelpMessage(chatId, env.TG_BOT_TOKEN);
    }

    return new Response("ok", { status: 200 });
    
  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Error:`, error);
    return new Response("err", { status: 200 });
  }
}

async function sendWelcomeMessage(chatId, token) {
  const welcomeText = `🤖 *Livepricetrackingbot v${BOT_VERSION} Online* ✅

Welcome! I'm your enhanced price tracking assistant.

📱 *How to use:*
1. Send me an Amazon or Flipkart product link
2. I'll extract product details and current price
3. Get real-time price information

🔗 *Supported platforms:*
• Amazon India (amazon.in)
• Flipkart (flipkart.com)

✨ *Example:*
Just paste: https://www.amazon.in/product-link
Or: https://www.flipkart.com/product-link

🆕 *New Features:*
• Real product data extraction
• Price detection and formatting
• Enhanced error handling
• Detailed product information

Ready to track some real prices! 🚀`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: welcomeText,
    parse_mode: "Markdown"
  });
}

async function sendHelpMessage(chatId, token) {
  const helpText = `❓ *Enhanced Price Tracker Help*

📝 *Instructions:*
• Send me a product URL from Amazon.in or Flipkart.com
• I'll fetch real product title and current price
• Get formatted product information instantly

🔗 *Supported URL formats:*
✅ https://www.amazon.in/product-name/dp/PRODUCT-ID
✅ https://amazon.in/dp/PRODUCT-ID  
✅ https://www.flipkart.com/product-name/p/PRODUCT-ID
✅ https://flipkart.com/product-name/p/PRODUCT-ID

🆕 *Enhanced Features:*
• Real-time price extraction
• Product title detection
• Platform identification
• Error handling with retry suggestions

*Try sending any Amazon or Flipkart product link!* 📊`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: helpText,
    parse_mode: "Markdown"
  });
}

function isProductURL(text) {
  // Enhanced regex patterns for better URL detection
  const amazonRegex = /https?://(www.)?amazon.in/[^s]*/dp/[A-Z0-9]{10}[^s]*/i;
  const flipkartRegex = /https?://(www.)?flipkart.com/[^s]*/p/[^s]+/i;
  
  // Also accept simpler Amazon URLs
  const amazonSimple = /https?://(www.)?amazon.in/[^s]+/i;
  const flipkartSimple = /https?://(www.)?flipkart.com/[^s]+/i;
  
  const result = amazonRegex.test(text) || flipkartRegex.test(text) || 
                 amazonSimple.test(text) || flipkartSimple.test(text);
  
  console.log(`🔍 [v${BOT_VERSION}] URL detection for "${text.substring(0, 50)}...": ${result}`);
  return result;
}

async function handleProductURL(chatId, url, token) {
  try {
    console.log(`🛒 [v${BOT_VERSION}] Processing product URL: ${url}`);
    
    // Send processing message
    await tgSendMessage(token, {
      chat_id: chatId,
      text: `🔍 *Processing your product link...*

Fetching real product data from the website! ⏳`,
      parse_mode: "Markdown"
    });

    // Determine platform
    const isAmazon = url.includes('amazon.in');
    const isFlipkart = url.includes('flipkart.com');
    
    let productInfo;
    if (isAmazon) {
      console.log(`🛍️ [v${BOT_VERSION}] Scraping Amazon product...`);
      productInfo = await scrapeAmazonProduct(url);
    } else if (isFlipkart) {
      console.log(`🛍️ [v${BOT_VERSION}] Scraping Flipkart product...`);
      productInfo = await scrapeFlipkartProduct(url);
    } else {
      throw new Error("URL format not recognized");
    }

    // Format and send product details
    const productText = formatProductMessage(productInfo, url);
    await tgSendMessage(token, {
      chat_id: chatId,
      text: productText,
      parse_mode: "Markdown"
    });

    console.log(`✅ [v${BOT_VERSION}] Product data sent successfully`);

  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Error processing URL:`, error);
    
    const errorText = `❌ *Unable to Process Product*

Sorry, I couldn't fetch the product details right now.

🔄 *Possible solutions:*
• Verify the URL is complete and correct
• Ensure it's from Amazon.in or Flipkart.com  
• Try copying the URL directly from your browser
• Some products may have restricted access

🆕 *Enhanced error detection active*
*Feel free to try another product link!* 📋`;

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log(`📡 [v${BOT_VERSION}] Amazon page loaded, size: ${html.length} chars`);
    
    // Enhanced extraction patterns
    const titlePatterns = [
      /<span[^>]*id="productTitle"[^>]*>s*(.*?)s*</span>/s,
      /<h1[^>]*class="[^"]*size-large[^"]*"[^>]*>s*(.*?)s*</h1>/s,
      /<title>(.*?)s*:s*Amazon.in/s
    ];
    
    const pricePatterns = [
      /₹s*([0-9,]+(?:.[0-9]{2})?)/g,
      /"priceAmount"[^>]*>s*₹s*([0-9,]+)/,
      /class="[^"]*price[^"]*"[^>]*>₹s*([0-9,]+)/i
    ];
    
    let title = "Amazon Product";
    let price = "Price not available";
    
    // Try to extract title
    for (const pattern of titlePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        title = match[1].replace(/<[^>]*>/g, '').trim();
        if (title.length > 0 && title !== "Amazon.in") {
          title = title.substring(0, 150) + (title.length > 150 ? "..." : "");
          break;
        }
      }
    }
    
    // Try to extract price
    const priceMatches = Array.from(html.matchAll(/₹s*([0-9,]+(?:.[0-9]{2})?)/g));
    if (priceMatches.length > 0) {
      // Get the most common price or first valid price
      const prices = priceMatches.map(match => match[1].replace(/,/g, '')).filter(p => parseInt(p) > 0);
      if (prices.length > 0) {
        price = parseInt(prices[0]).toLocaleString('en-IN');
      }
    }
    
    const result = {
      title: title,
      price: price,
      platform: "Amazon India",
      url: url,
      timestamp: new Date().toISOString(),
      success: true
    };
    
    console.log(`✅ [v${BOT_VERSION}] Amazon extraction result:`, result);
    return result;
    
  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Amazon scraping failed:`, error);
    return {
      title: "Amazon Product",
      price: "Unable to fetch price",
      platform: "Amazon India",
      url: url,
      timestamp: new Date().toISOString(),
      success: false,
      error: error.message
    };
  }
}

async function scrapeFlipkartProduct(url) {
  try {
    console.log(`🌐 [v${BOT_VERSION}] Fetching Flipkart page...`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log(`📡 [v${BOT_VERSION}] Flipkart page loaded, size: ${html.length} chars`);
    
    // Enhanced extraction patterns for Flipkart
    const titlePatterns = [
      /<span[^>]*class="[^"]*B_NuCI[^"]*"[^>]*>(.*?)</span>/s,
      /<h1[^>]*class="[^"]*_35KyD6[^"]*"[^>]*>(.*?)</h1>/s,
      /<title>(.*?)s*-s*Flipkart/s
    ];
    
    let title = "Flipkart Product";
    let price = "Price not available";
    
    // Try to extract title
    for (const pattern of titlePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        title = match[1].replace(/<[^>]*>/g, '').trim();
        if (title.length > 0 && !title.includes("Flipkart")) {
          title = title.substring(0, 150) + (title.length > 150 ? "..." : "");
          break;
        }
      }
    }
    
    // Try to extract price
    const priceMatches = Array.from(html.matchAll(/₹([0-9,]+)/g));
    if (priceMatches.length > 0) {
      const prices = priceMatches.map(match => match[1].replace(/,/g, '')).filter(p => parseInt(p) > 0);
      if (prices.length > 0) {
        price = parseInt(prices[0]).toLocaleString('en-IN');
      }
    }
    
    const result = {
      title: title,
      price: price,
      platform: "Flipkart",
      url: url,
      timestamp: new Date().toISOString(),
      success: true
    };
    
    console.log(`✅ [v${BOT_VERSION}] Flipkart extraction result:`, result);
    return result;
    
  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Flipkart scraping failed:`, error);
    return {
      title: "Flipkart Product",
      price: "Unable to fetch price",
      platform: "Flipkart",
      url: url,
      timestamp: new Date().toISOString(),
      success: false,
      error: error.message
    };
  }
}

function formatProductMessage(productInfo, url) {
  const timestamp = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  if (productInfo.success) {
    return `📦 *Product Found Successfully!* ✅

🏷️ *Product:* ${productInfo.title}

💰 *Current Price:* ₹${productInfo.price}

🛒 *Platform:* ${productInfo.platform}

🔗 [View on ${productInfo.platform}](${url})

📊 *Status:* Live data extracted
🕒 *Fetched:* ${timestamp}
🤖 *Bot:* v${BOT_VERSION}

*Price tracking data successfully retrieved!* 📈✨`;
  } else {
    return `⚠️ *Partial Data Retrieved*

🏷️ *Product:* ${productInfo.title}
💰 *Price:* ${productInfo.price}
🛒 *Platform:* ${productInfo.platform}

🔗 [View Product](${url})

ℹ️ *Note:* Some data may be limited due to website restrictions
🕒 *Attempted:* ${timestamp}

*You can still view the product using the link above!* 📋`;
  }
}

async function tgSendMessage(token, payload) {
  if (!token) {
    console.error(`❌ [v${BOT_VERSION}] Bot token missing`);
    throw new Error("Bot token not configured");
  }

  const api = `https://api.telegram.org/bot${token}/sendMessage`;
  
  try {
    const response = await fetch(api, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const result = await response.text();
    console.log(`📨 [v${BOT_VERSION}] Telegram response: ${response.status}`);
    return result;
    
  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Telegram API error:`, error);
    throw error;
  }
}