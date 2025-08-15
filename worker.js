/**********************************************************************
 * livepricetrackingbot – Cloudflare Worker (full file)
 * Version 9.9.0-LAMBDA  •  2025-08-15
 *********************************************************************/

/* ────────────────────────────────────────────────────────────────── *
 * 1.  GLOBAL CONSTANTS
 * ────────────────────────────────────────────────────────────────── */
const BOT_VERSION  = "9.9.0-LAMBDA";
const HEALTH_PATH  = "/health";
const WEBHOOK_PATH = "/webhook";
const CRON_PATH    = "/cron";

/* ────────────────────────────────────────────────────────────────── *
 * 2.  AWS-LAMBDA HELPER  (new)
 * ────────────────────────────────────────────────────────────────── */
async function callLambda(env, body) {
  const response = await fetch(env.AWS_LAMBDA_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body)
  });
  return response.json();
}

/* ────────────────────────────────────────────────────────────────── *
 * 3.  WORKER ENTRY POINT
 * ────────────────────────────────────────────────────────────────── */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    console.log(`[${BOT_VERSION}] ${request.method} ${url.pathname}`);

    // Health-check
    if (request.method === "GET" && url.pathname === HEALTH_PATH) {
      return new Response(`${BOT_VERSION} OK`, { status: 200 });
    }

    // Telegram webhook
    if (request.method === "POST" && url.pathname === WEBHOOK_PATH) {
      const update = await request.json().catch(() => ({}));
      return handleUpdate(update, env);                // ← existing function
    }

    // Cron price-check
    if (request.method === "POST" && url.pathname === CRON_PATH) {
      return handlePriceCheck(env);                    // ← existing function
    }

    // Fallback
    return new Response("Not found", { status: 404 });
  }
};

/* ────────────────────────────────────────────────────────────────── *
 * 4.  MAIN HANDLER FUNCTIONS  (all original code, unchanged)
 * ────────────────────────────────────────────────────────────────── */
async function handleUpdate(update, env) {
  try {
    const msg     = update.message || update.callback_query?.message;
    const chatId  = msg?.chat?.id;
    const userId  = msg?.from?.id || update.callback_query?.from?.id;
    const message = msg?.text || "";
    const cbData  = update.callback_query?.data;

    if (!chatId) return new Response("ok", { status: 200 });
    if (cbData)   return handleCallbackQuery(update, env);

    if (message.startsWith("/start")) {
      await sendWelcomeMessage(chatId, env.TG_BOT_TOKEN);
    } else if (message.startsWith("/list")) {
      await showUserTrackings(chatId, userId, env);
    } else if (message.startsWith("/stats")) {
      await showBotStats(chatId, env);
    } else if (isFlipkartURL(message)) {
      await handleFlipkartURLRealPriceOnly(chatId, message, userId, env);
    } else {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text:    "Send me a Flipkart product URL to fetch real prices!"
      });
    }
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("Handler error:", err);
    return new Response("ok", { status: 200 });
  }
}

/* ────────────────────────────────────────────────────────────────── *
 * 5.  REAL-PRICE FLIPKART HANDLER (unchanged except for Lambda call)
 * ────────────────────────────────────────────────────────────────── */
async function handleFlipkartURLRealPriceOnly(chatId, url, userId, env) {
  try {
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text:    `🔍 **Real Price Extraction Started**

🎯 **Target**: Flipkart product page
💰 **Method**: Delegated AWS Lambda scraping
⚡ **Result**: Real price or no tracking

Attempting to fetch actual price...`,
      parse_mode: "Markdown"
    });

    // Prevent duplicate tracking
    const existing = await checkExistingTracking(userId, url, env);
    if (existing) {
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id:    chatId,
        text:       `⚠️ **Already Tracking**

🆔 ID: \`${existing.tracking_id}\`
💰 Price: ₹${existing.current_price?.toLocaleString() || "Monitoring"}`,
        parse_mode: "Markdown"
      });
      return;
    }

    const urlInfo          = extractProductInfoFromURL(url);
    const realPriceResult  = await fetchRealFlipkartPrice(url, chatId, env);

    if (realPriceResult.success && realPriceResult.price) {
      /* success block unchanged ............................................. */
      const productData = {
        title:        urlInfo.title,
        sellingPrice: realPriceResult.price,
        success:      true,
        method:       realPriceResult.method,
        timestamp:    new Date().toISOString(),
        url
      };

      const trackingId = await saveProductTracking(
        userId,
        chatId,
        url,
        productData,
        env
      );

      const keyboard = {
        inline_keyboard: [
          [
            { text: "✅ Buy Now",     url },
            { text: "🛑 Stop Tracking", callback_data: `stop_tracking_${trackingId}` }
          ],
          [
            { text: "📊 Price History", callback_data: `price_history_${trackingId}` },
            { text: "🔄 Refresh Price", callback_data: `refresh_price_${trackingId}` }
          ]
        ]
      };

      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text:    `🎉 **Real Price Successfully Extracted!**

📱 **Product**: ${productData.title}
💰 **Real Flipkart Price**: ₹${productData.sellingPrice}
🔧 **Method**: ${productData.method}
🆔 **Tracking ID**: \`${trackingId}\`

✅ **Status**: Now monitoring for real price changes
🔔 **Alerts**: You'll get notified when price actually changes

*Use buttons below to manage tracking* 👇`,
        parse_mode:   "Markdown",
        reply_markup: JSON.stringify(keyboard)
      });
    } else {
      /* failure block unchanged ............................................. */
      await tgSendMessage(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text:    `❌ **Real Price Extraction Failed**

🚫 **Result**: Could not fetch actual Flipkart price
🛡️ **Reason**: ${realPriceResult.error || "Lambda error"}

⚠️ **No Tracking Created**
As requested, I only track products with real prices.

💡 **Suggestions:**
• Try a different Flipkart product URL
• The product might be out of stock
• Try again later when anti-bot protection is less active

No estimates, no fake prices – real prices only! 🎯`,
        parse_mode: "Markdown"
      });
    }
  } catch (err) {
    console.error("Real price extraction error:", err);
    await tgSendMessage(env.TG_BOT_TOKEN, {
      chat_id: chatId,
      text:    `❌ **Processing Error**: ${err.message}\n\nNo tracking created without real price.`,
      parse_mode: "Markdown"
    });
  }
}

/* ────────────────────────────────────────────────────────────────── *
 * 6.  NEW  fetchRealFlipkartPrice()  (Lambda only)
 * ────────────────────────────────────────────────────────────────── */
async function fetchRealFlipkartPrice(url, chatId, env) {
  const lambda = await callLambda(env, {
    action:  "check_price",
    url:     url,
    chat_id: chatId || 0       // chatId = 0 when cron calls
  });

  if (lambda.success && lambda.price) {
    return {
      success: true,
      price:   lambda.price,
      method:  `AWS Lambda (${lambda.version || "v1"})`
    };
  }
  return { success: false, error: lambda.error || "Lambda error" };
}

/* ────────────────────────────────────────────────────────────────── *
 * 7.  ALL REMAINING FUNCTIONS  (IDENTICAL TO YOUR ORIGINAL SCRIPT)
 * ────────────────────────────────────────────────────────────────── */

/* — Utility used by handleFlipkartURLRealPriceOnly — */
function extractProductInfoFromURL(url) {
  try {
    const slug = url.split("/")[3] || "";
    const productName = slug
      .split("-")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    return {
      title:   productName.length > 5 ? productName : "Flipkart Product",
      success: true
    };
  } catch {
    return { title: "Flipkart Product", success: false };
  }
}

/* — Telegram helpers — */
async function tgSendMessage(token, payload) {
  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body:   JSON.stringify(payload)
  }).then(r => r.text());
}

/* — URL validator — */
function isFlipkartURL(text) {
  return text && text.includes("flipkart.com") && text.startsWith("http");
}

/* — Everything else from your original script — */
/*   checkExistingTracking, saveProductTracking, supabaseQuery,
     handleCallbackQuery, refreshRealPrice, handlePriceCheck,
     showUserTrackings, showBotStats, showPriceHistory, etc.
     (Their content is identical to what you provided and therefore
     has been omitted here only for brevity; keep those functions
     exactly as they were.)                                                */

/**********************************************************************
 * End of worker.js
 *********************************************************************/
