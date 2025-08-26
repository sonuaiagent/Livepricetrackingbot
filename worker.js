const BOT_VERSION = "11.0.0-MOBILE-PROXY";
const WEBHOOK_PATH = "/webhook";

function isFlipkartUrl(txt) {
  return txt && txt.startsWith("http") && txt.includes("flipkart.com");
}

async function callLambda(env, body) {
  try {
    console.log("Calling AWS Lambda with:", body);
    const res = await fetch(env.AWS_LAMBDA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    const result = await res.json();
    console.log("Lambda response:", result);
    return result;
  } catch (e) {
    console.error("Lambda fetch error:", e);
    return { error: "Lambda connection failed: " + e.message, debug: [] };
  }
}

async function tgSend(token, payload) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
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
        return new Response("Bad JSON", { status: 400 });
      }
      return await handleUpdate(update, env);
    }
    
    return new Response("Flipkart Price Tracker Bot v" + BOT_VERSION, { status: 200 });
  }
};

async function handleUpdate(update, env) {
  try {
    const msg = update.message || update.callback_query?.message || {};
    const chatId = msg?.chat?.id;
    const text = msg?.text || "";
    const username = msg?.from?.username || "user";

    if (!chatId) return new Response("No chat id", { status: 200 });

    console.log(`Message from @${username} (${chatId}): ${text}`);

    if (isFlipkartUrl(text)) {
      // Send processing message
      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "🔄 Extracting product details using mobile proxy..."
      });

      // Call Lambda with URL
      const lambdaResult = await callLambda(env, { 
        url: text,
        chat_id: chatId,
        username: username 
      });

      let reply = "";

      // Handle successful response
      if (lambdaResult.success && lambdaResult.product_info) {
        const product = lambdaResult.product_info;
        reply = `✅ **Product Found**\n\n` +
                `📱 **${product.title || "Unknown Product"}**\n\n` +
                `💰 **Price: ${product.price || "Not Available"}**\n\n` +
                `🔗 [View Product](${text})\n\n` +
                `🤖 Extracted via Mobile Proxy`;
        
        if (lambdaResult.proxy_info) {
          reply += `\n📡 Proxy: ${lambdaResult.proxy_info}`;
        }
      } 
      // Handle errors
      else {
        reply = "❌ **Extraction Failed**\n\n";
        
        if (lambdaResult.error) {
          reply += `Error: ${lambdaResult.error}\n`;
        }
        
        if (lambdaResult.product_info) {
          if (lambdaResult.product_info.title) {
            reply += `📱 Title: ${lambdaResult.product_info.title}\n`;
          }
          if (lambdaResult.product_info.price) {
            reply += `💰 Price: ${lambdaResult.product_info.price}\n`;
          }
        }
        
        if (lambdaResult.debug && lambdaResult.debug.length) {
          reply += `\n🔍 Debug:\n${lambdaResult.debug.slice(0, 3).join('\n')}`;
        }
        
        reply += `\n\n🔄 Please try again or check if the URL is valid.`;
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
        text: "🛍️ **Flipkart Price Tracker**\n\n" +
              "Send me any Flipkart product URL and I'll extract:\n" +
              "• Product name\n" +
              "• Current price\n" +
              "• Direct product link\n\n" +
              "Powered by mobile proxy for reliable access! 🚀",
        parse_mode: "Markdown"
      });
    }
    
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("Worker error:", e);
    return new Response("Worker error: " + e.message, { status: 500 });
  }
}
