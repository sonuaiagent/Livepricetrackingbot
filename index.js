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
Just paste: `https://www.amazon.in/product-link`
Or: `https://www.flipkart.com/product-link`

Ready to track some prices! 🚀`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: welcomeText,
    parse_mode: "Markdown"
  });
}

function isProductURL(text) {
  const amazonRegex = /https?://(www.)?amazon.in/[^s]+/i;
  const flipkartRegex = /https?://(www.)?flipkart.com/[^s]+/i;
  
  return amazonRegex.test(text) || flipkartRegex.test(text);
}

async function handleProductURL(chatId, url, token, env) {
  await tgSendMessage(token, {
    chat_id: chatId,
    text: "🔍 *Processing your product link...*

Price tracking functionality coming soon! ⏳",
    parse_mode: "Markdown"
  });
}

async function sendHelpMessage(chatId, token) {
  const helpText = `❓ *How to use Price Tracker:*

📝 *Instructions:*
• Send me a product URL from Amazon.in or Flipkart.com
• I'll fetch the current price and product details

🔗 *Supported URLs:*
✅ `https://www.amazon.in/...`
✅ `https://www.flipkart.com/...`

*Example:* Just paste any product link and I'll get started! 📊`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: helpText,
    parse_mode: "Markdown"
  });
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