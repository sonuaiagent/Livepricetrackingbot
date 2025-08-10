// Version and deployment tracking
const BOT_VERSION = "2.4.0";
const DEPLOYMENT_ID = `dep-${Date.now()}`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    console.log(`🚀 Bot Version: ${BOT_VERSION} | Deployment: ${DEPLOYMENT_ID}`);
    console.log(`🔑 Bot Token exists: ${!!env.TG_BOT_TOKEN}`);

    if (request.method === "POST" && url.pathname === "/webhook") {
      const update = await request.json().catch(() => ({}));
      return handleUpdate(update, env);
    }

    return new Response(`✅ Bot Version: ${BOT_VERSION} - Status: Running`, { status: 200 });
  }
};

async function handleUpdate(update, env) {
  try {
    const msg = update.message || update.edited_message;
    const chatId = msg?.chat?.id;
    const messageText = msg?.text || "";
    
    if (!chatId) return new Response("ok", { status: 200 });
    
    console.log(`📨 [v${BOT_VERSION}] Message: "${messageText}" from chat: ${chatId}`);

    if (messageText.startsWith('/start')) {
      await sendWelcomeMessage(chatId, env.TG_BOT_TOKEN);
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

🔧 *Bot Version:* ${BOT_VERSION}

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
✅ https://www.flipkart.com/...

🔧 *Debug Info:*
• Version: ${BOT_VERSION}

*Example:* Just paste any product link! 📊`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: helpText,
    parse_mode: "Markdown"
  });
}

async function tgSendMessage(token, payload) {
  if (!token) {
    console.error("❌ Bot token not found in environment variables");
    throw new Error("Bot token not configured");
  }

  const api = `https://api.telegram.org/bot${token}/sendMessage`;
  
  console.log(`📤 [v${BOT_VERSION}] Sending message to chat: ${payload.chat_id}`);
  
  try {
    const response = await fetch(api, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const result = await response.text();
    console.log(`📨 [v${BOT_VERSION}] Telegram response status: ${response.status}`);
    return result;
    
  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Error sending message:`, error);
    throw error;
  }
}