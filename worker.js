const BOT_VERSION = "10.0.0-LAMBDA-Debug";
const HEALTH_PATH = "/health";
const WEBHOOK_PATH = "/webhook";

async function callLambda(env, body) {
  try {
    const res = await fetch(env.AWS_LAMBDA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (e) {
    return { error: "DBG-01E " + e.message, debug: [] };
  }
}

async function tgSend(token, payload) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function isFlipkartUrl(txt) {
  return !!(txt && txt.startsWith("http") && txt.includes("flipkart.com"));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === HEALTH_PATH) {
      return new Response("Health OK " + BOT_VERSION, { status: 200 });
    }
    if (request.method === "POST" && url.pathname === WEBHOOK_PATH) {
      let update;
      try { update = await request.json(); } catch (e) {
        return new Response("Bad JSON", { status: 400 });
      }
      return await handleUpdate(update, env);
    }
    return new Response("Unknown route", { status: 404 });
  }
};

async function handleUpdate(update, env) {
  try {
    const msg = update.message || update.callback_query?.message || {};
    const chatId = msg?.chat?.id;
    const text = msg?.text || "";

    if (!chatId) return new Response("No chat id", { status: 200 });

    if (text.startsWith("/start")) {
      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "Welcome! Send me Flipkart product URLs to track prices."
      });
    } else if (isFlipkartUrl(text)) {
      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "DBG-11A Starting price extraction..."
      });
      const lambdaResult = await callLambda(env, {
        url: text
      });

      let reply = "";

      // If Lambda errored out
      if (lambdaResult.error || !lambdaResult.product_info || !lambdaResult.product_info.price) {
        // Try to collect as much debug info as possible
        if (lambdaResult.error) reply += "Lambda error: " + lambdaResult.error + "\n";
        if (lambdaResult.product_info && lambdaResult.product_info.title)
          reply += "Extracted Title: " + lambdaResult.product_info.title + "\n";
        if (lambdaResult.product_info && lambdaResult.product_info.price)
          reply += "Extracted Price: " + lambdaResult.product_info.price + "\n";
        if (lambdaResult.debug) reply += "Debug:\n" + lambdaResult.debug.join("\n");

        await tgSend(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: reply || "DBG-11D Lambda failed and returned no debug info."
        });
      } else {
        // Success!
        reply += `Title: ${lambdaResult.product_info.title || "-"}\nPrice: ${lambdaResult.product_info.price || "-"}\n`;
        if (lambdaResult.debug) reply += "Debug:\n" + lambdaResult.debug.join("\n");
        await tgSend(env.TG_BOT_TOKEN, {
          chat_id: chatId,
          text: reply
        });
      }
    } else {
      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "Send a Flipkart product URL to track."
      });
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response("Worker error: " + e.message, { status: 500 });
  }
}
