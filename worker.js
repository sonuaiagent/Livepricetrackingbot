// worker.js - Complete Telegram Bot for Go Scraper Service
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    try {
      console.log(`📥 Request: ${request.method} ${url.pathname}`);
      
      // Handle Telegram webhook
      if (url.pathname.startsWith('/webhook/') && request.method === 'POST') {
        return await handleTelegramWebhook(request, env);
      }
      
      // Setup webhook endpoint
      if (url.pathname === '/setWebhook') {
        return await setupWebhook(env);
      }
      
      // Health check
      if (url.pathname === '/health') {
        return await handleHealthCheck(env);
      }
      
      // Default response
      return new Response(JSON.stringify({
        message: '🚀 Go-Powered Termux Scraper Bot v3.0',
        status: 'online',
        scraper: 'Go (Ultra-Fast)',
        endpoints: {
          'POST /webhook/{token}': 'Telegram webhook',
          'GET /setWebhook': 'Setup webhook',
          'GET /health': 'Health check'
        },
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error('❌ Worker error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

/**
 * Handle Telegram webhook
 */
async function handleTelegramWebhook(request, env) {
  try {
    // Validate environment variables
    if (!env.TG_BOT_TOKEN || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      console.error('❌ Missing environment variables');
      return new Response('OK');
    }
    
    const body = await request.json();
    console.log('📨 Telegram update:', JSON.stringify(body, null, 2));
    
    const message = body.message;
    if (!message) {
      return new Response('OK');
    }
    
    const chatId = message.chat.id;
    const text = message.text || '';
    const username = message.from.username || message.from.first_name || 'User';
    
    console.log(`👤 Message from @${username}: ${text}`);
    
    // Handle commands
    if (text.startsWith('/start')) {
      await sendMessage(env, chatId, 
        `🚀 *Go-Powered Scraper Bot v3.0*

` +
        `Welcome @${username}! 👋

` +
        `⚡ *Ultra-Fast Go Service*
` +
        `🛒 *Amazon & Flipkart Support*

` +
        `*Commands:*
` +
        `• `/health` - Test Go scraper connection
` +
        `• `/url` - Show database status
` +
        `• `go` - Test Go service response
` +
        `• Send Amazon/Flipkart URL for price info

` +
        `✨ Ready to track prices with lightning speed!`
      );
    }
    else if (text.startsWith('/health')) {
      await handleHealthCommand(env, chatId);
    }
    else if (text.startsWith('/url')) {
      await handleUrlCommand(env, chatId);
    }
    else if (text.toLowerCase() === 'go') {
      await handleGoCommand(env, chatId, username);
    }
    else if (text.includes('amazon.in') || text.includes('flipkart.com')) {
      await handleProductUrl(env, chatId, text, username);
    }
    else {
      await sendMessage(env, chatId,
        `❓ *Available Commands:*

` +
        `• `/health` - Test Go scraper
` +
        `• `/url` - Database status
` +
        `• `go` - Test Go service
` +
        `• Send a product URL to scrape

` +
        `🚀 Powered by ultra-fast Go service!`
      );
    }
    
    return new Response('OK');
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return new Response('OK');
  }
}

/**
 * Handle 'go' command - Test Go service
 */
async function handleGoCommand(env, chatId, username) {
  try {
    await sendMessage(env, chatId, '🔄 Testing Go scraper service...');
    
    // Get tunnel URL from database
    const tunnelUrl = await getTunnelUrl(env);
    if (!tunnelUrl) {
      await sendMessage(env, chatId, '❌ No tunnel URL found in database');
      return;
    }
    
    // Test Go service with 'go' command
    const startTime = Date.now();
    const scraperResponse = await fetch(`${tunnelUrl}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        command: 'go',
        chat_id: chatId.toString(),
        username: username
      }),
      timeout: 10000
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!scraperResponse.ok) {
      await sendMessage(env, chatId, 
        `❌ *Go Service Error*

` +
        `📡 Status: HTTP ${scraperResponse.status}
` +
        `🌐 URL: `${tunnelUrl}`
` +
        `⚡ Response Time: ${responseTime}ms

` +
        `🔧 Check if Go scraper is running!`
      );
      return;
    }
    
    const result = await scraperResponse.json();
    
    if (result.success) {
      await sendMessage(env, chatId,
        `✅ *Go Service Response*

` +
        `${result.message}

` +
        `⚡ Response Time: ${responseTime}ms
` +
        `🚀 Service Status: Active
` +
        `💡 Performance: Ultra-Fast!`
      );
    } else {
      await sendMessage(env, chatId, `⚠️ Go service responded: ${result.error || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.error('Go command error:', error);
    await sendMessage(env, chatId, `❌ Error testing Go service: ${error.message}`);
  }
}

/**
 * Handle /health command
 */
async function handleHealthCommand(env, chatId) {
  try {
    await sendMessage(env, chatId, '🔍 Checking Go scraper health...');
    
    const tunnelUrl = await getTunnelUrl(env);
    if (!tunnelUrl) {
      await sendMessage(env, chatId, '❌ No tunnel URL found in database');
      return;
    }
    
    // Test health endpoint
    const startTime = Date.now();
    const healthResponse = await fetch(`${tunnelUrl}/health`, {
      method: 'GET',
      timeout: 10000
    });
    
    const responseTime = Date.now() - startTime;
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      await sendMessage(env, chatId,
        `✅ *Go Scraper Health Check*

` +
        `🌐 *URL:* `${tunnelUrl}`
` +
        `📡 *Status:* Healthy ✅
` +
        `⚡ *Response Time:* ${responseTime}ms
` +
        `🚀 *Service:* ${healthData.service}
` +
        `📅 *Version:* ${healthData.version}
` +
        `🕐 *Timestamp:* ${healthData.timestamp}

` +
        `💡 Ready to scrape at lightning speed!`
      );
    } else {
      await sendMessage(env, chatId,
        `❌ *Go Scraper Unhealthy*

` +
        `🌐 *URL:* `${tunnelUrl}`
` +
        `📡 *Status:* HTTP ${healthResponse.status}
` +
        `⚡ *Response Time:* ${responseTime}ms

` +
        `🔧 Check Termux Go scraper service!`
      );
    }
    
  } catch (error) {
    console.error('Health command error:', error);
    await sendMessage(env, chatId, 
      `❌ *Health Check Failed*

` +
      `📡 Connection timeout or error
` +
      `🔧 Ensure tunnel and Go scraper are running

` +
      `Error: ${error.message}`
    );
  }
}

/**
 * Handle /url command - Show database status
 */
async function handleUrlCommand(env, chatId) {
  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/proxy_config?id=eq.24&select=*`,
      {
        headers: {
          'apikey': env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`
        },
        timeout: 8000
      }
    );
    
    if (!response.ok) {
      await sendMessage(env, chatId, `❌ Database error: HTTP ${response.status}`);
      return;
    }
    
    const data = await response.json();
    if (!data || data.length === 0) {
      await sendMessage(env, chatId, '⚠️ No database records found');
      return;
    }
    
    const record = data[0];
    const lastUpdated = new Date(record.last_updated);
    const minutesAgo = Math.round((Date.now() - lastUpdated.getTime()) / (1000 * 60));
    
    const message = 
      `📊 *Database Status*

` +
      `🌐 *Tunnel URL:*
`${record.tunnel_url || 'Not set'}`

` +
      `🚀 *Proxy:* `${record.proxy_url}`
` +
      `📡 *Local IP:* `${record.local_ip}`
` +
      `🔌 *Port:* `8080` (Go Service)
` +
      `📶 *Status:* `${record.status}`
` +
      `💚 *Health:* `${record.health_status}`

` +
      `🕐 *Updated:* ${minutesAgo} minutes ago
` +
      `${minutesAgo > 15 ? '⚠️ Data might be stale!' : '✅ Data is fresh!'}

` +
      `⚡ *Service Type:* Go (Ultra-Fast)`;
    
    await sendMessage(env, chatId, message);
    
  } catch (error) {
    console.error('URL command error:', error);
    await sendMessage(env, chatId, `❌ Error: ${error.message}`);
  }
}

/**
 * Handle product URL scraping
 */
async function handleProductUrl(env, chatId, productUrl, username) {
  try {
    await sendMessage(env, chatId, '🔄 Processing product URL with Go scraper...');
    
    const tunnelUrl = await getTunnelUrl(env);
    if (!tunnelUrl) {
      await sendMessage(env, chatId, '❌ No tunnel URL found in database');
      return;
    }
    
    // Determine product type
    const type = productUrl.includes('amazon.in') ? 'amazon' : 'flipkart';
    
    // Send to Go scraper service
    const startTime = Date.now();
    const scraperResponse = await fetch(`${tunnelUrl}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url: productUrl,
        command: type,
        chat_id: chatId.toString(),
        username: username,
        type: type
      }),
      timeout: 30000
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!scraperResponse.ok) {
      await sendMessage(env, chatId, 
        `❌ *Scraper Failed*

` +
        `📡 Status: HTTP ${scraperResponse.status}
` +
        `⚡ Response Time: ${responseTime}ms
` +
        `🌐 URL: `${tunnelUrl}`

` +
        `🔧 Check if Go scraper is running!`
      );
      return;
    }
    
    const result = await scraperResponse.json();
    
    if (result.success && result.product_info) {
      const product = result.product_info;
      await sendMessage(env, chatId,
        `✅ *Product Found* (⚡${responseTime}ms)

` +
        `📱 *${product.title}*

` +
        `💰 **Price: ₹${product.price}**
` +
        `⭐ Rating: ${product.rating || 'N/A'}
` +
        `📦 Status: ${product.availability || 'Check website'}

` +
        `🔗 [View Product](${productUrl})

` +
        `🚀 *Processed by Go Service*`
      );
    } else {
      await sendMessage(env, chatId, 
        `⚠️ *Product Not Found*

` +
        `${result.message || 'Product unavailable or URL invalid'}

` +
        `⚡ Response Time: ${responseTime}ms
` +
        `🚀 Processed by Go Service`
      );
    }
    
  } catch (error) {
    console.error('Product URL error:', error);
    await sendMessage(env, chatId, `❌ Scraping failed: ${error.message}`);
  }
}

/**
 * Get tunnel URL from database
 */
async function getTunnelUrl(env) {
  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/proxy_config?id=eq.24&select=tunnel_url`,
      {
        headers: {
          'apikey': env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`
        }
      }
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const tunnelUrl = data[0]?.tunnel_url;
    
    if (!tunnelUrl || tunnelUrl === 'exit') {
      return null;
    }
    
    return tunnelUrl;
    
  } catch (error) {
    console.error('Error fetching tunnel URL:', error);
    return null;
  }
}

/**
 * Setup webhook
 */
async function setupWebhook(env) {
  try {
    if (!env.TG_BOT_TOKEN) {
      return new Response(JSON.stringify({
        success: false,
        error: 'TG_BOT_TOKEN not found in environment variables'
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    
    const webhookUrl = `https://livepricetrackingbot.sonuaiagent.workers.dev/webhook/${env.TG_BOT_TOKEN}`;
    
    const response = await fetch(
      `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: webhookUrl,
          allowed_updates: ["message"]
        })
      }
    );
    
    const result = await response.json();
    
    return new Response(JSON.stringify({
      success: result.ok,
      description: result.description,
      webhook_url: webhookUrl,
      service: 'Go Scraper Service',
      telegram_response: result
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * Handle health check
 */
async function handleHealthCheck(env) {
  try {
    return new Response(JSON.stringify({
      status: 'healthy',
      worker_version: '3.0',
      scraper_service: 'Go (Ultra-Fast)',
      environment_variables: {
        TG_BOT_TOKEN: !!env.TG_BOT_TOKEN,
        SUPABASE_URL: !!env.SUPABASE_URL,
        SUPABASE_ANON_KEY: !!env.SUPABASE_ANON_KEY
      },
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'unhealthy',
      error: error.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

/**
 * Send message to Telegram
 */
async function sendMessage(env, chatId, text) {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
      }
    );
    
    const result = await response.json();
    if (!result.ok) {
      console.error('❌ Telegram API error:', result);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Send message error:', error);
  }
}
