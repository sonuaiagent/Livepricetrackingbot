// Final Working Version - Direct Cloudflare Deploymentt
const BOT_VERSION = "6.1.0-FINAL";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    console.log(`🚀 Bot Version: ${BOT_VERSION} | Request: ${request.method} ${url.pathname}`);

    if (request.method === "POST" && url.pathname === "/webhook") {
      const update = await request.json().catch(() => ({}));
      return handleUpdate(update, env);
    }

    return new Response(`✅ Livepricetrackingbot v${BOT_VERSION} - Working!`, { status: 200 });
  }
};

async function handleUpdate(update, env) {
  try {
    const msg = update.message || update.edited_message;
    const chatId = msg?.chat?.id;
    const userId = msg?.from?.id;
    const messageText = msg?.text || "";
    
    if (!chatId) return new Response("ok", { status: 200 });
    
    console.log(`📨 Message from user ${userId}: "${messageText}"`);

    if (messageText.startsWith('/start')) {
      await sendWelcomeMessage(chatId, env.TG_BOT_TOKEN);
    } else if (isProductURL(messageText)) {
      await handleProductURL(chatId, messageText, env.TG_BOT_TOKEN);
    } else {
      await sendHelpMessage(chatId, env.TG_BOT_TOKEN);
    }

    return new Response("ok", { status: 200 });
    
  } catch (error) {
    console.error(`❌ Error:`, error);
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

🔗 *Supported formats:*
✅ Amazon India URLs
✅ Flipkart URLs

*Try sending any product link!* 📊`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: helpText,
    parse_mode: "Markdown"
  });
}

function isProductURL(text) {
  // COMPLETELY SAFE REGEX - NO COMPLEX PATTERNS
  const hasAmazon = text.includes('amazon.in');
  const hasFlipkart = text.includes('flipkart.com');
  const isHTTP = text.startsWith('http');
  
  const result = isHTTP && (hasAmazon || hasFlipkart);
  
  console.log(`🔍 URL detection: ${result}`);
  return result;
}

async function handleProductURL(chatId, url, token) {
  try {
    console.log(`🛒 Processing: ${url}`);
    
    await tgSendMessage(token, {
      chat_id: chatId,
      text: `🔍 *Processing your product link...*

Fetching product data! ⏳`,
      parse_mode: "Markdown"
    });

    const productInfo = await scrapeProduct(url);
    const productText = formatProductMessage(productInfo, url);
    
    await tgSendMessage(token, {
      chat_id: chatId,
      text: productText,
      parse_mode: "Markdown"
    });

    console.log(`✅ Product sent successfully`);

  } catch (error) {
    console.error(`❌ Error:`, error);
    
    await tgSendMessage(token, {
      chat_id: chatId,
      text: `❌ *Unable to Process Product*

Sorry, I couldn't fetch the product details. Please try again with a valid product URL.`,
      parse_mode: "Markdown"
    });
  }
}

async function scrapeProduct(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const isAmazon = url.includes('amazon.in');
    const platform = isAmazon ? "Amazon India" : "Flipkart";
    
    let title = `${platform} Product`;
    let price = "Price not available";
    
    // Simple title extraction
    if (isAmazon) {
      const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>([^<]+)</);
      if (titleMatch) {
        title = titleMatch[1].trim().substring(0, 100);
      }
    } else {
      const titleMatch = html.match(/<span[^>]*class="[^"]*B_NuCI[^"]*"[^>]*>([^<]+)</);
      if (titleMatch) {
        title = titleMatch[1].trim().substring(0, 100);
      }
    }
    
    // Simple price extraction
    const priceMatch = html.match(/₹([0-9,]+)/);
    if (priceMatch) {
      price = priceMatch[1];
    }
    
    return {
      title: title,
      price: price,
      platform: platform,
      success: true
    };
    
  } catch (error) {
    return {
      title: "Product",
      price: "Unable to fetch price",
      platform: url.includes('amazon.in') ? "Amazon India" : "Flipkart",
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