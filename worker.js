// worker.js - Optimized version with intelligent caching
let tunnelCache = {
  url: null,
  lastFetched: 0,
  cacheDuration: 5 * 60 * 1000 // 5 minutes in milliseconds
};

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      
      // Main scraping endpoint
      if (url.pathname === '/scrape' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { url: productUrl, type = 'flipkart' } = body;

        if (!productUrl) {
          return jsonResponse({ 
            success: false, 
            error: 'Missing product URL' 
          }, 400, corsHeaders);
        }

        // Get cached or fresh scraper URL
        const scraperUrl = await getCachedScraperUrl(env);
        console.log(`🚀 Using scraper: ${scraperUrl} (cached: ${isCacheValid()})`);

        // Forward request to scraper service
        const scraperResponse = await fetch(`${scraperUrl}/scrape`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'CloudflareWorker/1.2'
          },
          body: JSON.stringify({ url: productUrl, type: type }),
          timeout: 25000
        });

        if (!scraperResponse.ok) {
          // If scraper fails, try to refresh cache and retry once
          if (scraperResponse.status >= 500) {
            console.log('🔄 Scraper failed, refreshing cache and retrying...');
            const freshScraperUrl = await getScraperUrl(env, true); // Force refresh
            
            if (freshScraperUrl !== scraperUrl) {
              const retryResponse = await fetch(`${freshScraperUrl}/scrape`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: productUrl, type: type }),
                timeout: 20000
              });
              
              if (retryResponse.ok) {
                const retryData = await retryResponse.json();
                return jsonResponse({
                  success: true,
                  data: retryData,
                  scraper_used: freshScraperUrl,
                  retry_attempted: true
                }, 200, corsHeaders);
              }
            }
          }
          
          return jsonResponse({
            success: false,
            error: `Scraper service error: HTTP ${scraperResponse.status}`,
            scraper_used: scraperUrl
          }, scraperResponse.status, corsHeaders);
        }

        const data = await scraperResponse.json();
        
        return jsonResponse({
          success: true,
          data: data,
          scraper_used: scraperUrl,
          cache_hit: isCacheValid()
        }, 200, corsHeaders);
      }

      // Health check endpoint
      if (url.pathname === '/health') {
        const scraperUrl = await getCachedScraperUrl(env);
        return jsonResponse({
          status: 'healthy',
          scraper_url: scraperUrl,
          cache_status: {
            valid: isCacheValid(),
            age_minutes: Math.round((Date.now() - tunnelCache.lastFetched) / 60000),
            next_refresh_in: Math.round((tunnelCache.lastFetched + tunnelCache.cacheDuration - Date.now()) / 60000)
          }
        }, 200, corsHeaders);
      }

      return jsonResponse({
        message: 'Termux Scraper API v1.3 (Cached)',
        endpoints: {
          'POST /scrape': 'Scrape product data',
          'GET /health': 'Health check with cache status'
        }
      }, 200, corsHeaders);

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({
        success: false,
        error: error.message
      }, 500, corsHeaders);
    }
  }
};

/**
 * Get cached scraper URL or fetch fresh if cache is stale
 */
async function getCachedScraperUrl(env) {
  if (isCacheValid()) {
    console.log('✅ Using cached tunnel URL');
    return tunnelCache.url;
  }
  
  console.log('🔄 Cache expired, fetching fresh tunnel URL...');
  return await getScraperUrl(env, false);
}

/**
 * Check if cache is still valid
 */
function isCacheValid() {
  return tunnelCache.url && 
         tunnelCache.lastFetched && 
         (Date.now() - tunnelCache.lastFetched) < tunnelCache.cacheDuration;
}

/**
 * Fetch fresh scraper URL from Supabase and update cache
 */
async function getScraperUrl(env, forceRefresh = false) {
  const FALLBACK_URL = 'http://100.91.0.175:5000';
  
  try {
    if (!forceRefresh && isCacheValid()) {
      return tunnelCache.url;
    }

    console.log('📡 Fetching fresh tunnel URL from Supabase...');
    
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/proxy_config?id=eq.24&status=eq.active&select=tunnel_url,last_updated`, 
      {
        headers: {
          'apikey': env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 8000
      }
    );
    
    if (!response.ok) {
      console.error(`❌ Supabase error: ${response.status}`);
      return tunnelCache.url || FALLBACK_URL; // Use cache or fallback
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      console.log('⚠️ No tunnel records found');
      return tunnelCache.url || FALLBACK_URL;
    }
    
    const record = data[0];
    const { tunnel_url, last_updated } = record;
    
    if (!tunnel_url || tunnel_url === 'exit' || !tunnel_url.includes('trycloudflare.com')) {
      console.log(`⚠️ Invalid tunnel URL: ${tunnel_url}`);
      return tunnelCache.url || FALLBACK_URL;
    }
    
    // Check if tunnel is fresh (within 20 minutes)
    const lastUpdated = new Date(last_updated);
    const minutesAgo = (Date.now() - lastUpdated.getTime()) / (1000 * 60);
    
    if (minutesAgo > 20) {
      console.log(`⚠️ Tunnel is stale (${Math.round(minutesAgo)} min old)`);
      return tunnelCache.url || FALLBACK_URL;
    }
    
    // Update cache with fresh data
    tunnelCache.url = tunnel_url;
    tunnelCache.lastFetched = Date.now();
    
    console.log(`✅ Cached fresh tunnel URL: ${tunnel_url}`);
    return tunnel_url;
    
  } catch (error) {
    console.error(`❌ Error fetching tunnel: ${error.message}`);
    return tunnelCache.url || FALLBACK_URL; // Use cache or fallback
  }
}

/**
 * Helper function for JSON responses
 */
function jsonResponse(data, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      ...additionalHeaders
    }
  });
}
