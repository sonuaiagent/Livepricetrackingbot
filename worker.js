const BOT_VERSION = "10.0.0-LAMBDA-Prod";
const WEBHOOK_PATH = "/webhook";

function isFlipkartUrl(txt) {
  return txt && txt.startsWith("http") && txt.includes("flipkart.com");
}

async function callLambda(env, body) {
  try {
    const res = await fetch(env.AWS_LAMBDA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (e) {
    return { error: "Lambda fetch error: " + e.message, debug: [] };
  }
}

async function tgSend(token, payload) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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

    if (isFlipkartUrl(text)) {
      // Call Lambda with correct payload:
      await tgSend(env.TG_BOT_TOKEN, {
        chat_id: chatId,
        text: "DBG-11A Starting price extraction..."
      });

      // MUST send in { url: ... } payload
      const lambdaResult = await callLambda(env, { url: text });

      let reply = "";

      // Handle error
      if (lambdaResult.error || !lambdaResult.product_info || !lambdaResult.product_info.price) {
        if (lambdaResult.error) reply += "Lambda error: " + lambdaResult.error + "\n";
        if (lambdaResult.product_info && lambdaResult.product_info.title)
          reply += "Extracted Title: " + lambdaResult.product_info.title + "\n";
        if (lambdaResult.product_info && lambdaResult.product_info.price)
          reply += "Extracted Price: " + lambdaResult.product_info.price + "\n";
        if (lambdaResult.debug && lambdaResult.debug.length)
          reply += "Debug:\n" + lambdaResult.debug.join("\n");
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
        text: "Send any Flipkart product URL."
      });
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response("Worker error: " + e.message, { status: 500 });
  }
}
