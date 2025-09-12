const BOT_VERSION = "13.0.0-AUTO-DISCOVERY";
const WEBHOOK_PATH = "/webhook";
const FALLBACK_SCRAPER_URL = "https://armor-hundred-underground-these.trycloudflare.com";

async function getScraperUrl(env) {
  try {
    // Try to get active tunnel URL from Supabase
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/proxy_config?id=eq.termux-main&status=eq.active&select=tunnel_url,last_updated`, {
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0 && data[0].tunnel_url) {
        const tunnelUrl = data[0].tunnel_url;
        const lastUpdated = new Date(data[0].last_updated);
        const now = new Date();
        const timeDiff = (now - lastUpdated) / (1000 * 60); // minutes
        
        // Use tunnel URL if updated within last 10 minutes
        if (timeDiff < 10) {
          console.log(`Using Supabase tunnel URL: ${tunnelUrl} (updated ${Math.round(timeDiff)} min ago)`);
          return tunnelUrl;
        } else {
          console.log(`Supabase URL too old (${Math.round(timeDiff)} min), using fallback`);
        }
      }
    }
  } catch (e) {
    console.log(`Supabase lookup failed: ${e.message}, using fallback`);
  }
  
  console.log(`Using fallback URL: ${FALLBACK_SCRAPER_URL}`);
  return FALLBACK_SCRAPER_URL;
}

function isFlipkartUrl(txt) {
  return txt && txt.startsWith("http") && txt.includes("flipkart.com");
}

function isAmazonUrl(txt) {
  return txt && txt.startsWith("http") && txt.includes("amazon.");
}

function isTestCommand(txt) {
  return txt && txt.toLowerCase().trim() === "hi";
}

async function callScraper(env, body, retryWithFallback = true) {
  let scraperUrl = await getScraperUrl(env);
  
  try {
    const endpoint = scraperUrl.replace(/\/+$/, "") + "/scrape";
    console.log("Calling scraper:", endpoint);
    
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeout: 15000 // 15 second timeout
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const result = await res.json();
    console.log("Scraper response:", result);
    return result;
  } catch (e) {
    console.error("Scraper fetch error:", e);
    
    // If failed and we used Supabase URL, retry with fallback
    if (retryWithFallback && scraperUrl !== FALLBACK_SCRAPER_URL) {
      console.log("Retrying with fallback URL...");
      scraperUrl = FALLBACK_SCRAPER_URL;
      return await callScraper(env, body, false); // Prevent infinite retry
    }
    
    return { 
      success: false, 
      error: "Scraper connection failed: " + e.message, 
      debug: [
        `Tried URL: ${scraperUrl}`,
        `Error: ${e.message}`,
        "Check if Termux tunnel is running"
      ]
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
    
    // Health check endpoint
    if (request.method === "GET" && url.pathname === "/health") {
      const currentUrl = await getScraperUrl(env);
      return new Response(JSON.stringify({
        bot_version: BOT_VERSION,
        current_scraper_url: currentUrl,
        status: "ready",
        timestamp: new Date().toISOString()
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    return new Response(`Telegram Bot v${BOT_VERSION}\nAuto-Discovery Enabled\nStatus: Ready`, { 
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

    const isTest = isTestCommand(text);
    const isProductUrl = isFlipkartUrl(text) || isAmazonUrl(text);

    if (isTest || isProductUrl) {
      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: isTest ? 
          "🔄 Testing auto-discovery connection..." : 
          "🔄 Extracting via mobile proxy (auto-discovery)..."
      });

      const scraperRequest = {
        url: isTest ? "hi" : text,
        command: isTest ? "hi" : "",
        chat_id: chatId,
        username: username,
        first_name: firstName
      };

      const scraperResult = await callScraper(env, scraperRequest);
      let reply = "";

      if (scraperResult.success) {
        if (isTest) {
          reply = scraperResult.message || "✅ Auto-discovery connection successful!";
        } else if (scraperResult.product_info) {
          const product = scraperResult.product_info;
          reply = `✅ **Product Found**\n\n` +
                  `📱 **${product.title || "Unknown Product"}**\n\n` +
                  `💰 **Price: ${product.price || "Not Available"}**\n\n` +
                  `🔗 [View Product](${text})\n\n` +
                  `🤖 Auto-Discovery Mobile Proxy`;
          
          if (product.timestamp) {
            reply += `\n⏰ ${product.timestamp}`;
          }
        } else {
          reply = "✅ Request processed successfully!";
        }
      } else {
        reply = isTest ? 
          "❌ **Auto-Discovery Failed**\n\n" :
          "❌ **Extraction Failed**\n\n";
        
        if (scraperResult.error) {
          reply += `Error: ${scraperResult.error}\n`;
        }
        
        if (scraperResult.debug && scraperResult.debug.length) {
          reply += `\n🔍 Debug:\n${scraperResult.debug.slice(0, 3).join('\n')}`;
        }
        
        reply += isTest ? 
          `\n\n🔄 Check Termux tunnel status.` :
          `\n\n🔄 Please try again.`;
      }

      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: reply,
        parse_mode: "Markdown",
        disable_web_page_preview: true
      });
      
    } else {
      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "🛍️ **Auto-Discovery Scraper Bot**\n\n" +
              "Commands:\n" +
              "• Send `hi` to test auto-discovery\n" +
              "• Send any Amazon product URL\n" +
              "• Send any Flipkart product URL\n\n" +
              "🔄 Auto-discovers active tunnel URLs!\n\n" +
              `Bot Version: ${BOT_VERSION}`,
        parse_mode: "Markdown"
      });
    }
    
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("Worker error:", e);
    
    const msg = update?.message || update?.callback_query?.message || {};
    const chatId = msg?.chat?.id;
    
    if (chatId && env.TG_BOT_TOKEN) {
      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "❌ **Bot Error**\n\nAuto-discovery system encountered an issue.\n\n`Error: " + e.message + "`",
        parse_mode: "Markdown"
      });
    }
    
    return new Response("Worker error: " + e.message, { status: 500 });
  }
}
