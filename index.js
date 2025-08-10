const BOT_VERSION = "3.0.0";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    console.log(`Bot Version: ${BOT_VERSION} running`);

    if (request.method === "POST" && url.pathname === "/webhook") {
      const update = await request.json().catch(() => ({}));
      return handleUpdate(update, env);
    }

    return new Response(`Bot Version: ${BOT_VERSION} - Active`, { status: 200 });
  }
};

async function handleUpdate(update, env) {
  try {
    const msg = update.message || update.edited_message;
    const chatId = msg?.chat?.id;
    const messageText = msg?.text || "";
    
    if (!chatId) return new Response("ok", { status: 200 });

    if (messageText.startsWith('/start')) {
      await sendMessage(chatId, env.TG_BOT_TOKEN);
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("Error:", error);
    return new Response("err", { status: 200 });
  }
}

async function sendMessage(chatId, token) {
  const text = `🤖 Bot Version: ${BOT_VERSION} Online!

Welcome to Livepricetrackingbot!

Ready to track Amazon and Flipkart prices.

Just send me product URLs!`;

  const api = `https://api.telegram.org/bot${token}/sendMessage`;
  
  try {
    await fetch(api, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    });
  } catch (error) {
    console.error("Send error:", error);
  }
}