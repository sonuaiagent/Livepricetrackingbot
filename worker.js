// Enhanced Working Version - Robust Product Scraping
const BOT_VERSION = "6.4.0-ROBUST";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    console.log(`🚀 Bot Version: ${BOT_VERSION} | Request: ${request.method} ${url.pathname}`);

    if (request.method === "POST" && url.pathname === "/webhook") {
      const update = await request.json().catch(() => ({}));
      return handleUpdate(update, env);
    }

    return new Response(`✅ Livepricetrackingbot v${BOT_VERSION} - Robust Scraping!`, { status: 200 });
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

Welcome! I'm your robust price tracking assistant.

📱 *How to use:*
1. Send me an Amazon or Flipkart product link
2. I'll extract real product details and current price
3. Get comprehensive price information

🔗 *Supported platforms:*
• Amazon India (amazon.in)
• Flipkart (flipkart.com)

✨ *Example URLs:*
Just paste: https://www.amazon.in/product-link
Or: https://www.flipkart.com/product-link

🆕 *Robust Features:*
• Advanced product title extraction
• Multiple price detection methods
• Real-time scraping with fallbacks
• Enhanced error handling with details

Ready to track real prices! 🚀`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: welcomeText,
    parse_mode: "Markdown"
  });
}

async function sendHelpMessage(chatId, token) {
  const helpText = `❓ *Robust Price Tracker Help*

📝 *Instructions:*
• Send me a product URL from Amazon.in or Flipkart.com
• I'll fetch actual product title and current price
• Get formatted product information with details

🔗 *Supported formats:*
✅ https://www.amazon.in/product-name/dp/PRODUCT-ID
✅ https://amazon.in/dp/PRODUCT-ID
✅ https://www.flipkart.com/product-name/p/PRODUCT-ID
✅ https://flipkart.com/product-name/p/PRODUCT-ID

*Try sending any real Amazon or Flipkart product link!* 📊`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: helpText,
    parse_mode: "Markdown"
  });
}

function isProductURL(text) {
  const hasAmazon = text.includes('amazon.in');
  const hasFlipkart = text.includes('flipkart.com');
  const isHTTP = text.startsWith('http');
  
  const result = isHTTP && (hasAmazon || hasFlipkart);
  
  console.log(`🔍 [v${BOT_VERSION}] URL detection: ${result}`);
  return result;
}

async function handleProductURL(chatId, url, token) {
  try {
    console.log(`🛒 [v${BOT_VERSION}] Processing: ${url}`);
    
    await tgSendMessage(token, {
      chat_id: chatId,
      text: `🔍 *Processing your product link...*\n\n🚀 Extracting real product data! ⏳`,
      parse_mode: "Markdown"
    });

    const productInfo = await scrapeProductRobust(url);
    const productText = formatProductMessage(productInfo, url);
    
    await tgSendMessage(token, {
      chat_id: chatId,
      text: productText,
      parse_mode: "Markdown"
    });

    console.log(`✅ [v${BOT_VERSION}] Product sent: ${productInfo.title.substring(0, 50)}...`);

  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Error processing:`, error);
    
    await tgSendMessage(token, {
      chat_id: chatId,
      text: `❌ *Unable to Process Product*\n\nSorry, I couldn't fetch the product details.\n\n🔄 *Troubleshooting:*\n• Check if URL is complete and valid\n• Ensure it's from Amazon.in or Flipkart.com\n• Try a direct product page URL\n• Some pages may have anti-bot protection\n\n*Please try another product link!* 📋`,
      parse_mode: "Markdown"
    });
  }
}

async function scrapeProductRobust(url) {
  try {
    console.log(`🌐 [v${BOT_VERSION}] Fetching: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`📡 [v${BOT_VERSION}] Page loaded: ${html.length} chars`);
    
    const isAmazon = url.includes('amazon.in');
    const platform = isAmazon ? "Amazon India" : "Flipkart";

    let title = "Product";
    let price = "Price not available";
    let foundData = false;

    if (isAmazon) {
      // Amazon title extraction - multiple methods
      console.log(`🔍 [v${BOT_VERSION}] Extracting Amazon data...`);
      
      // Method 1: Product title span
      if (!foundData) {
        const titlePattern = 'id="productTitle"';
        const titleIndex = html.indexOf(titlePattern);
        if (titleIndex > -1) {
          const titleSection = html.substring(titleIndex, titleIndex + 1000);
          const startTag = titleSection.indexOf('>');
          const endTag = titleSection.indexOf('</span>');
          if (startTag > -1 && endTag > startTag) {
            const extractedTitle = titleSection.substring(startTag + 1, endTag)
              .replace(/<[^>]*>/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            if (extractedTitle.length > 5) {
              title = extractedTitle.length > 150 ? extractedTitle.substring(0, 150) + "..." : extractedTitle;
              foundData = true;
              console.log(`✅ [v${BOT_VERSION}] Amazon title found: ${title.substring(0, 50)}...`);
            }
          }
        }
      }

      // Method 2: H1 title
      if (!foundData) {
        const h1Pattern = '<h1';
        const h1Index = html.indexOf(h1Pattern);
        if (h1Index > -1) {
          const h1Section = html.substring(h1Index, h1Index + 500);
          const startTag = h1Section.indexOf('>');
          const endTag = h1Section.indexOf('</h1>');
          if (startTag > -1 && endTag > startTag) {
            const extractedTitle = h1Section.substring(startTag + 1, endTag)
              .replace(/<[^>]*>/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            if (extractedTitle.length > 5 && !extractedTitle.includes('Amazon')) {
              title = extractedTitle.length > 150 ? extractedTitle.substring(0, 150) + "..." : extractedTitle;
              foundData = true;
              console.log(`✅ [v${BOT_VERSION}] Amazon H1 title: ${title.substring(0, 50)}...`);
            }
          }
        }
      }

      // Amazon price extraction
      const pricePatterns = ['₹', 'INR', 'Rs'];
      for (const pattern of pricePatterns) {
        const priceIndex = html.indexOf(pattern);
        if (priceIndex > -1) {
          const priceSection = html.substring(priceIndex, priceIndex + 100);
          const priceMatch = priceSection.match(/₹[\s]*([0-9,]+)/);
          if (priceMatch && priceMatch[1]) {
            price = priceMatch[1];
            console.log(`✅ [v${BOT_VERSION}] Amazon price: ₹${price}`);
            break;
          }
        }
      }

    } else {
      // Flipkart extraction
      console.log(`🔍 [v${BOT_VERSION}] Extracting Flipkart data...`);
      
      // Flipkart title patterns
      const flipkartTitlePatterns = ['B_NuCI', '_35KyD6', 'product-title'];
      
      for (const pattern of flipkartTitlePatterns) {
        if (!foundData) {
          const patternIndex = html.indexOf(pattern);
          if (patternIndex > -1) {
            const section = html.substring(patternIndex, patternIndex + 800);
            const spanStart = section.indexOf('>');
            const spanEnd = section.indexOf('</span>');
            if (spanStart > -1 && spanEnd > spanStart) {
              const extractedTitle = section.substring(spanStart + 1, spanEnd)
                .replace(/<[^>]*>/g, '')
                .replace(/\s+/g, ' ')
                .trim();
              if (extractedTitle.length > 5 && !extractedTitle.includes('Flipkart')) {
                title = extractedTitle.length > 150 ? extractedTitle.substring(0, 150) + "..." : extractedTitle;
                foundData = true;
                console.log(`✅ [v${BOT_VERSION}] Flipkart title: ${title.substring(0, 50)}...`);
                break;
              }
            }
          }
        }
      }

      // Flipkart price extraction
      const flipkartPriceMatch = html.match(/₹([0-9,]+)/);
      if (flipkartPriceMatch) {
        price = flipkartPriceMatch[1];
        console.log(`✅ [v${BOT_VERSION}] Flipkart price: ₹${price}`);
      }
    }

    const result = {
      title: title,
      price: price,
      platform: platform,
      success: foundData || price !== "Price not available",
      timestamp: new Date().toISOString(),
      url: url
    };

    console.log(`🎯 [v${BOT_VERSION}] Final result:`, { 
      title: result.title.substring(0, 50) + "...", 
      price: result.price, 
      success: result.success 
    });
    
    return result;

  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Scraping error:`, error);
    return {
      title: "Product",
      price: "Unable to fetch price",
      platform: url.includes('amazon.in') ? "Amazon India" : "Flipkart",
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      url: url
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
    return `📦 *Product Successfully Extracted!* ✅

🏷️ *Product:* ${productInfo.title}

💰 *Current Price:* ₹${productInfo.price}

🛒 *Platform:* ${productInfo.platform}

🔗 [View on ${productInfo.platform}](${url})

📊 *Status:* Real data extracted successfully
🕒 *Fetched:* ${timestamp}
🤖 *Bot:* v${BOT_VERSION}

*Robust price tracking completed!* 📈✨`;

  } else {
    return `⚠️ *Limited Data Retrieved*

🏷️ *Product:* ${productInfo.title}
💰 *Price:* ${productInfo.price}
🛒 *Platform:* ${productInfo.platform}

🔗 [View Product](${url})

ℹ️ *Note:* Product page may have anti-scraping protection or unusual structure
🕒 *Attempted:* ${timestamp}
🤖 *Bot:* v${BOT_VERSION}

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
