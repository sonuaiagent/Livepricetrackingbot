// Enhanced Working Version - Improved Product Scraping
const BOT_VERSION = "6.2.0-ENHANCED";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    console.log(`🚀 Bot Version: ${BOT_VERSION} | Request: ${request.method} ${url.pathname}`);

    if (request.method === "POST" && url.pathname === "/webhook") {
      const update = await request.json().catch(() => ({}));
      return handleUpdate(update, env);
    }

    return new Response(`✅ Livepricetrackingbot v${BOT_VERSION} - Enhanced Scraping!`, { status: 200 });
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

🆕 *Enhanced Features:*
• Better product title extraction
• Improved price detection
• More reliable scraping
• Enhanced error handling

Ready to track prices! 🚀`;

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

🆕 *Enhanced capabilities:*
• Multiple price detection methods
• Better title extraction
• Platform identification
• Detailed product information

*Try sending any Amazon or Flipkart product link!* 📊`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: helpText,
    parse_mode: "Markdown"
  });
}

function isProductURL(text) {
  // SAFE URL DETECTION - NO COMPLEX REGEX
  const hasAmazon = text.includes('amazon.in');
  const hasFlipkart = text.includes('flipkart.com');
  const isHTTP = text.startsWith('http');
  
  // Additional validation for better detection
  const hasProductPath = text.includes('/dp/') || text.includes('/p/');
  
  const result = isHTTP && (hasAmazon || hasFlipkart);
  
  console.log(`🔍 URL detection: ${result} | Has product path: ${hasProductPath}`);
  return result;
}

async function handleProductURL(chatId, url, token) {
  try {
    console.log(`🛒 Processing: ${url}`);
    
    await tgSendMessage(token, {
      chat_id: chatId,
      text: `🔍 *Processing your product link...*\n\n🚀 Fetching enhanced product data! ⏳`,
      parse_mode: "Markdown"
    });

    const productInfo = await scrapeProduct(url);
    const productText = formatProductMessage(productInfo, url);
    
    await tgSendMessage(token, {
      chat_id: chatId,
      text: productText,
      parse_mode: "Markdown"
    });

    console.log(`✅ Product sent successfully: ${productInfo.title}`);

  } catch (error) {
    console.error(`❌ Error processing URL:`, error);
    
    await tgSendMessage(token, {
      chat_id: chatId,
      text: `❌ *Unable to Process Product*\n\nSorry, I couldn't fetch the product details right now.\n\n🔄 *Possible solutions:*\n• Check if the URL is complete and correct\n• Ensure it's from Amazon.in or Flipkart.com\n• Try copying the URL directly from your browser\n• Some products may have restricted access\n\n*Feel free to try another product link!* 📋`,
      parse_mode: "Markdown"
    });
  }
}

async function scrapeProduct(url) {
  try {
    console.log(`🌐 Fetching product page: ${url}`);
    
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
    console.log(`📡 Page loaded, size: ${html.length} chars`);
    
    const isAmazon = url.includes('amazon.in');
    const platform = isAmazon ? "Amazon India" : "Flipkart";

    let title = `${platform} Product`;
    let price = "Price not available";

    if (isAmazon) {
      // Enhanced Amazon title extraction - AVOIDING COMPLEX REGEX
      const titlePatterns = [
        'id="productTitle"',
        'class="a-size-large',
        'class="a-spacing-none a-color-base"'
      ];
      
      for (const pattern of titlePatterns) {
        const startIndex = html.indexOf(pattern);
        if (startIndex !== -1) {
          const afterPattern = html.substring(startIndex);
          const nextClose = afterPattern.indexOf('>');
          const endTag = afterPattern.indexOf('</');
          
          if (nextClose !== -1 && endTag !== -1 && endTag > nextClose) {
            const extracted = afterPattern.substring(nextClose + 1, endTag);
            const cleaned = extracted.replace(/\s+/g, ' ').trim();
            
            if (cleaned.length > 10 && !cleaned.includes('Amazon')) {
              title = cleaned.substring(0, 120);
              if (title.length === 120) title += "...";
              break;
            }
          }
        }
      }

      // Enhanced Amazon price extraction
      const priceIndicators = ['₹', 'MRP', 'Price', 'Deal'];
      for (const indicator of priceIndicators) {
        const priceIndex = html.indexOf(indicator);
        if (priceIndex !== -1) {
          const priceSection = html.substring(priceIndex, priceIndex + 200);
          // SAFE APPROACH - NO COMPLEX REGEX
          const numbers = priceSection.match(/₹\s*([0-9,]+)/);
          if (numbers && numbers[1]) {
            price = numbers[1];
            break;
          }
        }
      }

    } else {
      // Enhanced Flipkart title extraction
      const titleKeywords = ['B_NuCI', 'product-title', '_35KyD6'];
      
      for (const keyword of titleKeywords) {
        const startIndex = html.indexOf(keyword);
        if (startIndex !== -1) {
          const section = html.substring(startIndex, startIndex + 500);
          const spanStart = section.indexOf('>');
          const spanEnd = section.indexOf('</');
          
          if (spanStart !== -1 && spanEnd !== -1 && spanEnd > spanStart) {
            const extracted = section.substring(spanStart + 1, spanEnd);
            const cleaned = extracted.replace(/\s+/g, ' ').trim();
            
            if (cleaned.length > 10 && !cleaned.includes('Flipkart')) {
              title = cleaned.substring(0, 120);
              if (title.length === 120) title += "...";
              break;
            }
          }
        }
      }

      // Enhanced Flipkart price extraction
      const priceMatch = html.match(/₹([0-9,]+)/);
      if (priceMatch) {
        price = priceMatch[1];
      }
    }

    const result = {
      title: title,
      price: price,
      platform: platform,
      success: true,
      timestamp: new Date().toISOString()
    };

    console.log(`✅ Extraction result:`, result);
    return result;

  } catch (error) {
    console.error(`❌ Scraping failed:`, error);
    return {
      title: "Product",
      price: "Unable to fetch price",
      platform: url.includes('amazon.in') ? "Amazon India" : "Flipkart",
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
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

*Enhanced price tracking data successfully retrieved!* 📈✨`;

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
    console.error(`❌ Bot token missing`);
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
    console.log(`📨 Telegram response: ${response.status}`);
    return result;
    
  } catch (error) {
    console.error(`❌ Telegram API error:`, error);
    throw error;
  }
}
