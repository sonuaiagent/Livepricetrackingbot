export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith('/webhook/')) {
      return await handleTelegram(request, env);
    }
    
    if (url.pathname === '/setWebhook') {
      return await setupWebhook(env);
    }
    
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        worker: 'Go Scraper Bot with Flipkart & Amazon Support',
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({
      message: 'Go-Powered Flipkart & Amazon Scraper Bot v2.0',
      status: 'online'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

async function handleTelegram(request, env) {
  try {
    if (!env.TG_BOT_TOKEN) return new Response('OK');
    
    const body = await request.json();
    if (!body.message) return new Response('OK');
    
    const msg = body.message;
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const username = msg.from.username || msg.from.first_name || 'User';
    
    // Check for Flipkart URLs
    let flipkartMatch = null;
    if (text.includes('flipkart.com')) {
      const flipkartPattern = new RegExp('https?:\\/\\/(?:www\\.)?flipkart\\.com\\/[^\\s]+', 'i');
      flipkartMatch = text.match(flipkartPattern);
    }
    
    // Check for Amazon URLs
    let amazonMatch = null;
    if (text.includes('amazon.')) {
      const amazonPattern = new RegExp('https?:\\/\\/(?:www\\.)?amazon\\.[a-z.]+\\/[^\\s]+', 'i');
      amazonMatch = text.match(amazonPattern);
    }
    
    if (flipkartMatch) {
      await handleProductUrl(env, chatId, flipkartMatch[0], username, 'Flipkart');
    }
    else if (amazonMatch) {
      await handleProductUrl(env, chatId, amazonMatch[0], username, 'Amazon');
    }
    else if (text === '/start') {
      const startMessage = `🚀 Go-Powered Flipkart & Amazon Scraper Bot v2.0

📱 Commands:
/health - Check service status
/url - Database status
go - Test Go service

🛒 Send me a Flipkart product URL
📦 Send me an Amazon product URL
I'll scrape product details instantly!`;
      await sendTelegramMsg(env, chatId, startMessage);
    }
    else if (text === '/health') {
      await testGoHealth(env, chatId);
    }
    else if (text === '/url') {
      await showDatabaseStatus(env, chatId);
    }
    else if (text === 'go') {
      await testGoService(env, chatId, username);
    }
    else if (text.startsWith('http') && !flipkartMatch && !amazonMatch) {
      const errorMessage = `❌ Only Flipkart and Amazon URLs are supported.

🛒 Flipkart: https://www.flipkart.com/product-name/p/...
📦 Amazon: https://www.amazon.in/product-name/dp/...`;
      await sendTelegramMsg(env, chatId, errorMessage);
    }
    else {
      const helpMessage = `🤖 Commands: /health /url go

🛒 Send me a Flipkart URL
📦 Send me an Amazon URL
I'll scrape product details instantly!`;
      await sendTelegramMsg(env, chatId, helpMessage);
    }
    
    return new Response('OK');
  } catch (error) {
    console.error('Telegram handler error:', error);
    return new Response('OK');
  }
}

async function handleProductUrl(env, chatId, productUrl, username, platform) {
  try {
    const platformEmoji = platform === 'Flipkart' ? '🛒' : '📦';
    const processingMessage = `${platformEmoji} Processing ${platform} URL...
⏳ Extracting product information...`;
    await sendTelegramMsg(env, chatId, processingMessage);
    
    const tunnel = await getTunnelUrl(env);
    if (!tunnel) {
      await sendTelegramMsg(env, chatId, '❌ Go scraper service is not available. Please try again later.');
      return;
    }
    
    const start = Date.now();
    const resp = await fetch(tunnel + '/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: 'scrape',
        url: productUrl,
        chat_id: String(chatId),
        username: username
      })
    });
    
    const time = Date.now() - start;
    
    if (resp.ok) {
      const result = await resp.json();
      
      if (result.success && result.product_info) {
        const product = result.product_info;
        
        let message = `${platformEmoji} ${platform} Product Found!

`;
        
        if (platform === 'Flipkart') {
          message += `📱 Name: ${product.name || 'Not found'}
💰 Price: ${product.price || 'Not found'}
⭐ Rating: ${product.rating || 'Not available'}`;
        } else if (platform === 'Amazon') {
          message += `📱 Name: ${product.title || 'Not found'}
💰 Price: ${product.price || 'Not found'}
🏷️ MRP: ${product.mrp || 'Not found'}
💸 Discount: ${product.discount || 'Not found'}
⭐ Rating: ${product.rating || 'Not available'}
📦 Availability: ${product.availability || 'Not available'}`;
        }
        
        message += `

⚡ Response time: ${time}ms`;
        await sendTelegramMsg(env, chatId, message);
      } else {
        const errorMsg = result.error || 'Failed to extract product information';
        await sendTelegramMsg(env, chatId, `❌ Scraping failed: ${errorMsg}`);
      }
    } else {
      await sendTelegramMsg(env, chatId, `❌ Go scraper service error: HTTP ${resp.status}`);
    }
  } catch (error) {
    console.error(platform + ' scraping error:', error);
    await sendTelegramMsg(env, chatId, `❌ Error processing ${platform} URL: ${error.message}`);
  }
}

async function testGoService(env, chatId, username) {
  try {
    const tunnel = await getTunnelUrl(env);
    if (!tunnel) {
      await sendTelegramMsg(env, chatId, '❌ No tunnel URL found');
      return;
    }
    
    const start = Date.now();
    const resp = await fetch(tunnel + '/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: 'go',
        chat_id: String(chatId),
        username: username
      })
    });
    
    const time = Date.now() - start;
    
    if (resp.ok) {
      const result = await resp.json();
      const message = `🚀 Go Service v2.0 Test:
${result.message}
⚡ Response: ${time}ms`;
      await sendTelegramMsg(env, chatId, message);
    } else {
      await sendTelegramMsg(env, chatId, `❌ Go service error: HTTP ${resp.status}`);
    }
  } catch (error) {
    await sendTelegramMsg(env, chatId, `❌ Test error: ${error.message}`);
  }
}

async function testGoHealth(env, chatId) {
  try {
    const tunnel = await getTunnelUrl(env);
    if (!tunnel) {
      await sendTelegramMsg(env, chatId, '❌ No tunnel URL found');
      return;
    }
    
    const start = Date.now();
    const resp = await fetch(tunnel + '/health');
    const time = Date.now() - start;
    
    if (resp.ok) {
      const health = await resp.json();
      const message = `💚 Go Scraper v2.0 Health Check

🔗 URL: ${tunnel}
⚡ Response: ${time}ms
🔧 Service: ${health.service}
📅 Status: ${health.status}
🛒 Flipkart scraping: Ready!
📦 Amazon scraping: Ready!`;
      await sendTelegramMsg(env, chatId, message);
    } else {
      await sendTelegramMsg(env, chatId, `❌ Health check failed: HTTP ${resp.status}`);
    }
  } catch (error) {
    await sendTelegramMsg(env, chatId, `❌ Health error: ${error.message}`);
  }
}

async function showDatabaseStatus(env, chatId) {
  try {
    const resp = await fetch(env.SUPABASE_URL + '/rest/v1/proxy_config?id=eq.24&select=*', {
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + env.SUPABASE_ANON_KEY
      }
    });
    
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.length > 0) {
        const record = data[0];
        const minutes = Math.round((Date.now() - new Date(record.last_updated).getTime()) / 60000);
        const message = `🗄️ Database Status

🔗 Tunnel: ${record.tunnel_url}
🚪 Port: 8080
📊 Status: ${record.status}
⏰ Updated: ${minutes} min ago
🛒 Flipkart scraper: Active
📦 Amazon scraper: Active`;
        await sendTelegramMsg(env, chatId, message);
      } else {
        await sendTelegramMsg(env, chatId, '❌ No database records found');
      }
    } else {
      await sendTelegramMsg(env, chatId, `❌ Database error: HTTP ${resp.status}`);
    }
  } catch (error) {
    await sendTelegramMsg(env, chatId, `❌ Database error: ${error.message}`);
  }
}

async function getTunnelUrl(env) {
  try {
    const resp = await fetch(env.SUPABASE_URL + '/rest/v1/proxy_config?id=eq.24&select=tunnel_url', {
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + env.SUPABASE_ANON_KEY
      }
    });
    
    if (resp.ok) {
      const data = await resp.json();
      const url = data[0] && data[0].tunnel_url;
      return (url && url !== 'exit') ? url : null;
    }
    return null;
  } catch (error) {
    console.error('Tunnel URL error:', error);
    return null;
  }
}

async function setupWebhook(env) {
  try {
    if (!env.TG_BOT_TOKEN) {
      return new Response(JSON.stringify({ success: false, error: 'No bot token' }));
    }
    
    const webhookUrl = 'https://livepricetrackingbot.sonuaiagent.workers.dev/webhook/' + env.TG_BOT_TOKEN;
    
    const resp = await fetch('https://api.telegram.org/bot' + env.TG_BOT_TOKEN + '/setWebhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url: webhookUrl, 
        allowed_updates: ['message'],
        drop_pending_updates: true
      })
    });
    
    const result = await resp.json();
    return new Response(JSON.stringify({
      success: result.ok,
      description: result.description,
      webhook_url: webhookUrl
    }));
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }));
  }
}

async function sendTelegramMsg(env, chatId, text) {
  try {
    await fetch('https://api.telegram.org/bot' + env.TG_BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: chatId, 
        text: text,
        disable_web_page_preview: true
      })
    });
  } catch (error) {
    console.error('Send message error:', error);
  }
}
