// In worker.js, replace the getScraperUrl function:
async function getScraperUrl(env) {
  try {
    // Use integer ID 24 instead of string "termux-main"
    const response = await fetch(
      `${env.SUPABASE_URL}/rest/v1/proxy_config?id=eq.24&status=eq.active&select=tunnel_url,last_updated`, {
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0 && data[0].tunnel_url) {
        const tunnelUrl = data[0].tunnel_url;
        const lastUpdated = new Date(data[0].last_updated);
        const now = new Date();
        const timeDiff = (now - lastUpdated) / (1000 * 60); // minutes
        
        if (timeDiff < 10) {
          console.log(`Using Supabase tunnel URL: ${tunnelUrl} (updated ${Math.round(timeDiff)} min ago)`);
          return tunnelUrl;
        } else {
          console.log(`Supabase URL too old (${Math.round(timeDiff)} min), using fallback`);
        }
      }
    }
  } catch (e) {
    console.log(`Supabase lookup failed: ${e.message}, using fallback`);
  }
  
  console.log(`Using fallback URL: ${FALLBACK_SCRAPER_URL}`);
  return FALLBACK_SCRAPER_URL;
}
