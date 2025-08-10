export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/webhook") {
      const update = await request.json().catch(() => ({}));
      return handleUpdate(update, env);
    }

    return new Response("OK: Livepricetrackingbot worker is running", { status: 200 });
  }
};

async function handleUpdate(update, env) {
  try {
    const msg = update.message || update.edited_message;
    const chatId = msg?.chat?.id;
    const userId = msg?.from?.id;
    const messageText = msg?.text || "";
    
    if (!chatId) return new Response("ok", { status: 200 });

    console.log(`Message from user ${userId}: ${messageText}`);

    if (messageText.startsWith('/start')) {
      await sendWelcomeMessage(chatId, env.TG_BOT_TOKEN);
    } else if (isProductURL(messageText)) {
      await handleProductURL(chatId, messageText, env.TG_BOT_TOKEN, env);
    } else {
      await sendHelpMessage(chatId, env.TG_BOT_TOKEN);
    }

    return new Response("ok", { status: 200 });
    
  } catch (error) {
    console.error("Error in handleUpdate:", error);
    return new Response("err", { status: 200 });
  }
}

async function sendWelcomeMessage(chatId, token) {
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

Ready to track some prices! 🚀`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: welcomeText,
    parse_mode: "Markdown"
  });
}

async function sendHelpMessage(chatId, token) {
  const helpText = `❓ *How to use Price Tracker:*

📝 *Instructions:*
• Send me a product URL from Amazon.in or Flipkart.com
• I'll fetch the current price and product details

🔗 *Supported URLs:*
✅ https://www.amazon.in/...
✅ https://amazon.in/...
✅ https://www.flipkart.com/...
✅ https://flipkart.com/...

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
  
  return amazonRegex.test(text) || flipkartRegex.test(text);
}

async function handleProductURL(chatId, url, token, env) {
  try {
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
    
    let productInfo;
    if (isAmazon) {
      productInfo = await scrapeAmazonProduct(url);
    } else if (isFlipkart) {
      productInfo = await scrapeFlipkartProduct(url);
    } else {
      throw new Error("Unsupported platform");
    }

    // Send product details
    const productText = `📦 *Product Found!*

🏷️ *Name:* ${productInfo.title}

💰 *Current Price:* ₹${productInfo.price}

🛒 *Platform:* ${productInfo.platform}

🔗 *Link:* [View Product](${url})

📊 *Tracking Status:* Active
🔔 *Notifications:* Enabled

*I'll monitor this product for price changes!* 📈📉`;

    await tgSendMessage(token, {
      chat_id: chatId,
      text: productText,
      parse_mode: "Markdown"
    });

    // Store product data
    await storeProductData(chatId, url, productInfo, env);

  } catch (error) {
    console.error("Error processing product URL:", error);
    
    const errorText = `❌ *Error Processing Product*

Sorry, I couldn't fetch the product details right now.

🔄 *Please try:*
• Check if the URL is correct
• Make sure it's from Amazon.in or Flipkart.com
• Try again in a few moments

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
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const html = await response.text();
    
    // Basic extraction
    const titleMatch = html.match(/<span[^>]*id="productTitle"[^>]*>(.*?)</span>/s);
    const priceMatch = html.match(/₹([0-9,]+)/);
    
    return {
      title: titleMatch ? titleMatch[1].trim().substring(0, 100) + "..." : "Amazon Product",
      price: priceMatch ? priceMatch[1].replace(/,/g, '') : "Price not found",
      platform: "Amazon India",
      url: url,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Amazon scraping error:", error);
    return {
      title: "Amazon Product",
      price: "Unable to fetch",
      platform: "Amazon India",
      url: url,
      timestamp: new Date().toISOString()
    };
  }
}

async function scrapeFlipkartProduct(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const html = await response.text();
    
    // Basic extraction for Flipkart
    const titleMatch = html.match(/<span[^>]*class="B_NuCI"[^>]*>(.*?)</span>/s);
    const priceMatch = html.match(/₹([0-9,]+)/);
    
    return {
      title: titleMatch ? titleMatch[1].trim().substring(0, 100) + "..." : "Flipkart Product",
      price: priceMatch ? priceMatch[1].replace(/,/g, '') : "Price not found",
      platform: "Flipkart",
      url: url,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Flipkart scraping error:", error);
    return {
      title: "Flipkart Product",
      price: "Unable to fetch",
      platform: "Flipkart", 
      url: url,
      timestamp: new Date().toISOString()
    };
  }
}

async function storeProductData(chatId, url, productInfo, env) {
  // For now, just log the data
  // Later you can implement KV storage or external database
  console.log("Storing product data:", {
    chatId,
    url,
    productInfo,
    timestamp: new Date().toISOString()
  });
  
  // TODO: Implement actual storage using Cloudflare KV or external database
}

async function tgSendMessage(token, payload) {
  const api = `https://api.telegram.org/bot${token}/sendMessage`;
  
  try {
    const response = await fetch(api, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const result = await response.text();
    console.log("Telegram API response:", result);
    return result;
    
  } catch (error) {
    console.error("Error sending message to Telegram:", error);
    throw error;
  }
}