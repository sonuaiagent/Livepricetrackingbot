// Simple Cloudflare Worker - No external dependencies needed
const BOT_VERSION = "6.0.0-SIMPLE";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    console.log(`🚀 Bot Version: ${BOT_VERSION} | Request: ${request.method} ${url.pathname}`);

    if (request.method === "POST" && url.pathname === "/webhook") {
      const update = await request.json().catch(() => ({}));
      return handleUpdate(update, env);
    }

    return new Response(`✅ Livepricetrackingbot v${BOT_VERSION} - Simple Worker Approach!`, { status: 200 });
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

Welcome! I'm your price tracking assistant.

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

Ready to track prices! 🚀`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: welcomeText,
    parse_mode: "Markdown"
  });
}

async function sendHelpMessage(chatId, token) {
  const helpText = `❓ *Price Tracker Help*

📝 *Instructions:*
• Send me a product URL from Amazon.in or Flipkart.com
• I'll fetch product title and current price
• Get formatted product information

🔗 *Supported formats:*
✅ https://www.amazon.in/product-name/dp/PRODUCT-ID
✅ https://www.flipkart.com/product-name/p/PRODUCT-ID

*Try sending any Amazon or Flipkart product link!* 📊`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: helpText,
    parse_mode: "Markdown"
  });
}

function isProductURL(text) {
  // FINALLY FIXED - SIMPLE REGEX WITHOUT BUILD PIPELINE ISSUES
  const amazonPattern = /https?://(www.)?amazon.in/.*/dp/[A-Z0-9]{10}/i;
  const flipkartPattern = /https?://(www.)?flipkart.com/.*/p//i;
  const amazonSimple = /https?://(www.)?amazon.in//i;
  const flipkartSimple = /https?://(www.)?flipkart.com//i;
  
  const result = amazonPattern.test(text) || flipkartPattern.test(text) || 
                 amazonSimple.test(text) || flipkartSimple.test(text);
  
  console.log(`🔍 [v${BOT_VERSION}] URL detection: ${result}`);
  return result;
}

async function handleProductURL(chatId, url, token) {
  try {
    console.log(`🛒 [v${BOT_VERSION}] Processing: ${url}`);
    
    await tgSendMessage(token, {
      chat_id: chatId,
      text: `🔍 *Processing your product link...*

Fetching product data! ⏳`,
      parse_mode: "Markdown"
    });

    const isAmazon = url.includes('amazon.in');
    const isFlipkart = url.includes('flipkart.com');
    
    let productInfo;
    if (isAmazon) {
      productInfo = await scrapeAmazonProduct(url);
    } else if (isFlipkart) {
      productInfo = await scrapeFlipkartProduct(url);
    } else {
      throw new Error("URL format not recognized");
    }

    const productText = formatProductMessage(productInfo, url);
    await tgSendMessage(token, {
      chat_id: chatId,
      text: productText,
      parse_mode: "Markdown"
    });

    console.log(`✅ [v${BOT_VERSION}] Product sent successfully`);

  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Error:`, error);
    
    await tgSendMessage(token, {
      chat_id: chatId,
      text: `❌ *Unable to Process Product*

Sorry, I couldn't fetch the product details right now. Please try again with a valid Amazon.in or Flipkart.com product URL.`,
      parse_mode: "Markdown"
    });
  }
}

async function scrapeAmazonProduct(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    let title = "Amazon Product";
    let price = "Price not available";
    
    // Simple title extraction
    const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>(.*?)</span>/s);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]*>/g, '').trim().substring(0, 100);
    }
    
    // Simple price extraction
    const priceMatch = html.match(/₹([0-9,]+)/);
    if (priceMatch) {
      price = priceMatch[1];
    }
    
    return {
      title: title,
      price: price,
      platform: "Amazon India",
      success: true
    };
    
  } catch (error) {
    return {
      title: "Amazon Product",
      price: "Unable to fetch price",
      platform: "Amazon India",
      success: false
    };
  }
}

async function scrapeFlipkartProduct(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    let title = "Flipkart Product";
    let price = "Price not available";
    
    // Simple title extraction
    const titleMatch = html.match(/<span[^>]*class="[^"]*B_NuCI[^"]*"[^>]*>(.*?)</span>/s);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]*>/g, '').trim().substring(0, 100);
    }
    
    // Simple price extraction
    const priceMatch = html.match(/₹([0-9,]+)/);
    if (priceMatch) {
      price = priceMatch[1];
    }
    
    return {
      title: title,
      price: price,
      platform: "Flipkart",
      success: true
    };
    
  } catch (error) {
    return {
      title: "Flipkart Product",
      price: "Unable to fetch price",
      platform: "Flipkart",
      success: false
    };
  }
}

function formatProductMessage(productInfo, url) {
  const timestamp = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  return `📦 *Product Found!* ✅

🏷️ *Product:* ${productInfo.title}

💰 *Current Price:* ₹${productInfo.price}

🛒 *Platform:* ${productInfo.platform}

🔗 [View Product](${url})

🕒 *Fetched:* ${timestamp}
🤖 *Bot:* v${BOT_VERSION}`;
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
  
  return await response.text();
}