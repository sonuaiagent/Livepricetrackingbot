const BOT_VERSION = "12.0.0-TERMUX-SCRAPER";
const WEBHOOK_PATH = "/webhook";
const SCRAPER_URL = "https://armor-hundred-underground-these.trycloudflare.com";

function isFlipkartUrl(txt) {
  return txt && txt.startsWith("http") && txt.includes("flipkart.com");
}

function isAmazonUrl(txt) {
  return txt && txt.startsWith("http") && txt.includes("amazon.");
}

function isTestCommand(txt) {
  return txt && txt.toLowerCase().trim() === "hi";
}

async function callScraper(body) {
  try {
    const scraperUrl = SCRAPER_URL.replace(/\/+$/, "") + "/scrape";
    console.log("Calling Termux Scraper with:", body);
    console.log("Scraper URL:", scraperUrl);
    
    const res = await fetch(scraperUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const result = await res.json();
    console.log("Scraper response:", result);
    return result;
  } catch (e) {
    console.error("Scraper fetch error:", e);
    return { 
      success: false, 
      error: "Scraper connection failed: " + e.message, 
      debug: [`Error connecting to Termux scraper: ${e.message}`] 
    };
  }
}

async function tgSend(token, payload) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      console.error("Telegram API error:", response.status, response.statusText);
    }
  } catch (e) {
    console.error("Telegram send error:", e);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    if (request.method === "POST" && url.pathname === WEBHOOK_PATH) {
      let update;
      try { 
        update = await request.json(); 
      } catch (e) {
        console.error("Invalid JSON received:", e);
        return new Response("Bad JSON", { status: 400 });
      }
      return await handleUpdate(update, env);
    }
    
    return new Response(`Telegram Bot v${BOT_VERSION}\n\nConnected to Termux Scraper\nScraper URL: ${SCRAPER_URL}\nStatus: Ready`, { 
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
  }
};

async function handleUpdate(update, env) {
  try {
    const msg = update.message || update.callback_query?.message || {};
    const chatId = msg?.chat?.id;
    const text = msg?.text || "";
    const username = msg?.from?.username || "user";
    const firstName = msg?.from?.first_name || "";

    if (!chatId) {
      console.log("No chat ID found in update");
      return new Response("No chat id", { status: 200 });
    }

    console.log(`Message from @${username} (${firstName}) [${chatId}]: ${text}`);

    // Check if it's a test command or product URL
    const isTest = isTestCommand(text);
    const isProductUrl = isFlipkartUrl(text) || isAmazonUrl(text);

    if (isTest || isProductUrl) {
      // Send processing message
      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: isTest ? 
          "🔄 Testing connection to Termux scraper..." : 
          "🔄 Extracting product details via mobile proxy..."
      });

      // Prepare request body for scraper
      const scraperRequest = {
        url: isTest ? "hi" : text,
        command: isTest ? "hi" : "",
        chat_id: chatId,
        username: username,
        first_name: firstName
      };

      // Call Termux scraper via tunnel
      const scraperResult = await callScraper(scraperRequest);

      let reply = "";

      // Handle successful response
      if (scraperResult.success) {
        if (isTest) {
          // For test command, use the message directly
          reply = scraperResult.message || "✅ Scraper connection successful!";
        } else if (scraperResult.product_info) {
          // For product URLs, format the product info
          const product = scraperResult.product_info;
          reply = `✅ **Product Found**\n\n` +
                  `📱 **${product.title || "Unknown Product"}**\n\n` +
                  `💰 **Price: ${product.price || "Not Available"}**\n\n` +
                  `🔗 [View Product](${text})\n\n` +
                  `🤖 Extracted via Termux Mobile Proxy`;
          
          if (product.timestamp) {
            reply += `\n⏰ ${product.timestamp}`;
          }
        } else {
          reply = "✅ Request processed successfully!";
        }
      } 
      // Handle errors
      else {
        reply = isTest ? 
          "❌ **Scraper Connection Failed**\n\n" :
          "❌ **Extraction Failed**\n\n";
        
        if (scraperResult.error) {
          reply += `Error: ${scraperResult.error}\n`;
        }
        
        if (scraperResult.product_info) {
          if (scraperResult.product_info.title) {
            reply += `📱 Title: ${scraperResult.product_info.title}\n`;
          }
          if (scraperResult.product_info.price) {
            reply += `💰 Price: ${scraperResult.product_info.price}\n`;
          }
        }
        
        if (scraperResult.debug && scraperResult.debug.length) {
          reply += `\n🔍 Debug:\n${scraperResult.debug.slice(0, 3).join('\n')}`;
        }
        
        reply += isTest ? 
          `\n\n🔄 Check if Termux scraper is running.` :
          `\n\n🔄 Please try again or check if the URL is valid.`;
      }

      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: reply,
        parse_mode: "Markdown",
        disable_web_page_preview: true
      });
      
    } else {
      // Default help message
      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "🛍️ **Termux Mobile Scraper Bot**\n\n" +
              "Commands:\n" +
              "• Send `hi` to test connection\n" +
              "• Send any Amazon product URL\n" +
              "• Send any Flipkart product URL\n\n" +
              "I'll extract product name and price using mobile proxy! 🚀\n\n" +
              `Bot Version: ${BOT_VERSION}`,
        parse_mode: "Markdown"
      });
    }
    
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("Worker error:", e);
    
    // Try to send error message to user if we have chat ID
    const msg = update?.message || update?.callback_query?.message || {};
    const chatId = msg?.chat?.id;
    
    if (chatId && env.TG_BOT_TOKEN) {
      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "❌ **Bot Error**\n\nSomething went wrong. Please try again later.\n\n`Error: " + e.message + "`",
        parse_mode: "Markdown"
      });
    }
    
    return new Response("Worker error: " + e.message, { status: 500 });
  }
}
