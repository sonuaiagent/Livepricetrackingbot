// worker.js - Cloudflare Worker for E-commerce Price Tracking
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Main API endpoint
    if (url.pathname === '/scrape' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { url: productUrl, type = 'flipkart' } = body;

        if (!productUrl) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Missing product URL' 
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // Get current scraper service URL from Supabase
        const scraperUrl = await getScraperUrl(env);
        
        console.log(`Using scraper: ${scraperUrl}`);
        console.log(`Scraping: ${type} - ${productUrl}`);

        // Forward request to scraper service
        const scraperResponse = await fetch(`${scraperUrl}/scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: productUrl, type: type }),
        });

        if (!scraperResponse.ok) {
          throw new Error(`Scraper service error: ${scraperResponse.status}`);
        }

        const data = await scraperResponse.json();
        
        return new Response(JSON.stringify({
          success: true,
          data: data,
          scraper_used: scraperUrl,
          timestamp: new Date().toISOString()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });

      } catch (error) {
        console.error('Scraping error:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      const scraperUrl = await getScraperUrl(env);
      return new Response(JSON.stringify({
        status: 'healthy',
        scraper_url: scraperUrl,
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Default response
    return new Response(JSON.stringify({
      message: 'Termux Scraper API',
      endpoints: {
        'POST /scrape': 'Scrape product data',
        'GET /health': 'Health check'
      },
      version: '1.2.0'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
};

/**
 * Get active scraper URL from Supabase with IST time comparison
 * Falls back to default if Supabase is unavailable or tunnel is stale
 */
async function getScraperUrl(env) {
  const FALLBACK_SCRAPER_URL = 'https://termux-scraper-fallback.example.com';
  const FRESHNESS_MINUTES = 10; // Consider tunnel stale after 10 minutes
  
  try {
    console.log('🔍 Fetching tunnel URL from Supabase...');
    
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/proxy_config?id=eq.24&status=eq.active&select=tunnel_url,last_updated,local_ip,port`, 
      {
        headers: {
          'apikey': env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000 // 5 second timeout
      }
    );
    
    if (!response.ok) {
      console.log(`❌ Supabase API error: ${response.status}`);
      return FALLBACK_SCRAPER_URL;
    }
    
    const data = await response.json();
    console.log(`📊 Supabase response:`, JSON.stringify(data));
    
    if (!data || data.length === 0) {
      console.log('⚠️  No active tunnel record found in Supabase');
      return FALLBACK_SCRAPER_URL;
    }
    
    const record = data[0];
    const { tunnel_url, last_updated, local_ip, port } = record;
    
    if (!tunnel_url || tunnel_url === 'exit') {
      console.log('⚠️  Invalid or placeholder tunnel URL in database');
      return FALLBACK_SCRAPER_URL;
    }
    
    // Convert last_updated to IST and check freshness
    const lastUpdated = new Date(last_updated);
    const now = new Date();
    
    // Convert to IST for logging (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const lastUpdatedIST = new Date(lastUpdated.getTime() + istOffset);
    const nowIST = new Date(now.getTime() + istOffset);
    
    const minutesAgo = (now - lastUpdated) / (1000 * 60);
    
    console.log(`🕐 Last updated: ${lastUpdatedIST.toISOString().replace('T', ' ').slice(0, 19)} IST`);
    console.log(`🕐 Current time: ${nowIST.toISOString().replace('T', ' ').slice(0, 19)} IST`);
    console.log(`⏱️  Time difference: ${Math.round(minutesAgo)} minutes ago`);
    
    if (minutesAgo > FRESHNESS_MINUTES) {
      console.log(`⚠️  Tunnel URL is stale (${Math.round(minutesAgo)} min > ${FRESHNESS_MINUTES} min), using fallback`);
      return FALLBACK_SCRAPER_URL;
    }
    
    console.log(`✅ Using fresh tunnel URL: ${tunnel_url} (updated ${Math.round(minutesAgo)} min ago)`);
    return tunnel_url;
    
  } catch (error) {
    console.log(`❌ Supabase lookup failed: ${error.message}`);
    return FALLBACK_SCRAPER_URL;
  }
}
