// Enhanced Flipkart-Only Version - Advanced Scraping Techniques
const BOT_VERSION = "7.0.0-FLIPKART-ONLY";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    console.log(`🚀 Bot Version: ${BOT_VERSION} | Request: ${request.method} ${url.pathname}`);

    if (request.method === "POST" && url.pathname === "/webhook") {
      const update = await request.json().catch(() => ({}));
      return handleUpdate(update, env);
    }

    return new Response(`✅ Flipkart Price Tracker v${BOT_VERSION} - Flipkart Specialist!`, { status: 200 });
  }
};

async function handleUpdate(update, env) {
  try {
    const msg = update.message || update.edited_message;
    const chatId = msg?.chat?.id;
    const userId = msg?.from?.id;
    const messageText = msg?.text || "";

    if (!chatId) return new Response("ok", { status: 200 });

    console.log(`📨 [v${BOT_VERSION}] Message from user ${userId}: "${messageText}"`);

    if (messageText.startsWith('/start')) {
      await sendWelcomeMessage(chatId, env.TG_BOT_TOKEN);
    } else if (isFlipkartURL(messageText)) {
      await handleFlipkartURL(chatId, messageText, env.TG_BOT_TOKEN);
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
  const welcomeText = `🛒 *Flipkart Price Tracker v${BOT_VERSION}* ✅

Welcome! I'm your specialized **Flipkart-only** price tracking assistant.

📱 *Enhanced Features:*
• **Product Names & Titles** - Complete product information
• **Actual vs Selling Price** - Both MRP and discounted prices
• **Reviews & Ratings** - Customer feedback and star ratings
• **Product Specifications** - Memory, display, and technical details
• **Available Offers** - Current discounts and promotions
• **Advanced Scraping** - Multiple extraction methods for reliability

🔗 *Supported Platform:*
• **Flipkart.com ONLY** - Specialized extraction techniques

✨ *Example URLs:*
Just paste: https://www.flipkart.com/product-name/p/PRODUCT-ID
Or: https://flipkart.com/mobiles/pr?sid=tyy

🆕 *Advanced Capabilities:*
• Multiple price detection (MRP vs Sale)
• Review and rating extraction
• Specification parsing
• Offer and discount detection
• Error handling for missing data

Ready to track Flipkart prices with precision! 🚀`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: welcomeText,
    parse_mode: "Markdown"
  });
}

async function sendHelpMessage(chatId, token) {
  const helpText = `❓ *Flipkart Price Tracker Help*

📝 *Specialized for Flipkart:*
• Send me **ANY Flipkart product URL**
• I'll extract comprehensive product details
• Get actual price, selling price, reviews, and specifications

🔗 *Supported Flipkart URLs:*
✅ Product pages: flipkart.com/product-name/p/ID
✅ Mobile category: flipkart.com/mobiles/...
✅ Electronics: flipkart.com/electronics/...
✅ Any Flipkart product link

🆕 *What I Extract:*
• **Product Name** - Full title and description
• **Pricing** - Both MRP and selling price
• **Reviews** - Customer ratings and review count
• **Specifications** - Technical details when available
• **Offers** - Current discounts and promotions

*Send any Flipkart product link to get started!* 📊`;

  await tgSendMessage(token, {
    chat_id: chatId,
    text: helpText,
    parse_mode: "Markdown"
  });
}

function isFlipkartURL(text) {
  // Flipkart-only URL detection
  const hasFlipkart = text.includes('flipkart.com');
  const isHTTP = text.startsWith('http');
  
  const result = isHTTP && hasFlipkart;
  
  console.log(`🔍 [v${BOT_VERSION}] Flipkart URL detection: ${result}`);
  return result;
}

async function handleFlipkartURL(chatId, url, token) {
  try {
    console.log(`🛒 [v${BOT_VERSION}] Processing Flipkart URL: ${url}`);
    
    await tgSendMessage(token, {
      chat_id: chatId,
      text: `🔍 *Processing Flipkart Product...*\n\n🚀 Extracting comprehensive product data!\n• Product name & specifications\n• Actual vs selling price\n• Reviews & ratings\n• Available offers\n\n⏳ *Please wait...*`,
      parse_mode: "Markdown"
    });

    const productInfo = await scrapeFlipkartAdvanced(url);
    const productText = formatFlipkartMessage(productInfo, url);
    
    await tgSendMessage(token, {
      chat_id: chatId,
      text: productText,
      parse_mode: "Markdown"
    });

    console.log(`✅ [v${BOT_VERSION}] Flipkart product sent: ${productInfo.title.substring(0, 50)}...`);

  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Error processing Flipkart URL:`, error);
    
    await tgSendMessage(token, {
      chat_id: chatId,
      text: `❌ *Unable to Process Flipkart Product*\n\nSorry, I couldn't extract the product details.\n\n🔄 *Troubleshooting:*\n• Ensure the URL is a valid Flipkart product page\n• Check if the product is still available\n• Some pages may have anti-scraping protection\n• Try a direct product page URL\n\n*Please try another Flipkart product link!* 🛒`,
      parse_mode: "Markdown"
    });
  }
}

async function scrapeFlipkartAdvanced(url) {
  try {
    console.log(`🌐 [v${BOT_VERSION}] Fetching Flipkart page: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://www.flipkart.com/'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`📡 [v${BOT_VERSION}] Flipkart page loaded: ${html.length} chars`);
    
    // Initialize product data structure (as mentioned in video)
    let productData = {
      title: "Flipkart Product",
      actualPrice: "Not available",
      sellingPrice: "Not available",
      reviews: "No reviews",
      ratings: "No ratings",
      specifications: "Not available",
      offers: "No offers available",
      success: false
    };

    // Advanced title extraction using multiple class patterns
    console.log(`🔍 [v${BOT_VERSION}] Extracting product title...`);
    const titlePatterns = [
      'B_NuCI',           // Common product title class
      '_35KyD6',          // Alternative title class
      'yhB1nd',           // Another title variant
      'x-product-title-label',
      '_4rR01T'           // Mobile specific titles
    ];
    
    for (const pattern of titlePatterns) {
      const titleIndex = html.indexOf(pattern);
      if (titleIndex > -1) {
        const titleSection = html.substring(titleIndex, titleIndex + 1000);
        const spanStart = titleSection.indexOf('>');
        const spanEnd = titleSection.indexOf('</span>');
        if (spanStart > -1 && spanEnd > spanStart) {
          const extractedTitle = titleSection.substring(spanStart + 1, spanEnd)
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (extractedTitle.length > 5 && !extractedTitle.includes('Flipkart')) {
            productData.title = extractedTitle.length > 150 ? extractedTitle.substring(0, 150) + "..." : extractedTitle;
            productData.success = true;
            console.log(`✅ [v${BOT_VERSION}] Title found: ${productData.title.substring(0, 50)}...`);
            break;
          }
        }
      }
    }

    // Advanced price extraction - differentiate between actual and selling price
    console.log(`🔍 [v${BOT_VERSION}] Extracting prices (actual vs selling)...`);
    
    // Look for selling price (discounted price)
    const sellingPricePatterns = ['_30jeq3 _1_WHN1', '_25b18c', '_30jeq3', '_1_WHN1'];
    for (const pattern of sellingPricePatterns) {
      const priceIndex = html.indexOf(pattern);
      if (priceIndex > -1) {
        const priceSection = html.substring(priceIndex, priceIndex + 200);
        const priceMatch = priceSection.match(/₹([0-9,]+)/);
        if (priceMatch && priceMatch[1]) {
          productData.sellingPrice = priceMatch[1];
          console.log(`✅ [v${BOT_VERSION}] Selling price: ₹${productData.sellingPrice}`);
          break;
        }
      }
    }

    // Look for actual price (MRP/original price)
    const actualPricePatterns = ['_3I9_wc _2p6lqe', '_3auQ3N _2GcJzG', '_3I9_wc'];
    for (const pattern of actualPricePatterns) {
      const priceIndex = html.indexOf(pattern);
      if (priceIndex > -1) {
        const priceSection = html.substring(priceIndex, priceIndex + 200);
        const priceMatch = priceSection.match(/₹([0-9,]+)/);
        if (priceMatch && priceMatch[1]) {
          productData.actualPrice = priceMatch[1];
          console.log(`✅ [v${BOT_VERSION}] Actual price: ₹${productData.actualPrice}`);
          break;
        }
      }
    }

    // Extract reviews and ratings (handle cases with no reviews as mentioned in video)
    console.log(`🔍 [v${BOT_VERSION}] Extracting reviews and ratings...`);
    try {
      // Look for ratings
      const ratingPatterns = ['_3LWZlK', '_3LWZlK _1BLPMq', 'gUuXy-'];
      for (const pattern of ratingPatterns) {
        const ratingIndex = html.indexOf(pattern);
        if (ratingIndex > -1) {
          const ratingSection = html.substring(ratingIndex, ratingIndex + 100);
          const ratingMatch = ratingSection.match(/([0-9]\.[0-9])/);
          if (ratingMatch) {
            productData.ratings = ratingMatch[1] + " ⭐";
            console.log(`✅ [v${BOT_VERSION}] Rating: ${productData.ratings}`);
            break;
          }
        }
      }

      // Look for review count
      const reviewPatterns = ['_2_R_DZ', '_13vcmD', 'row _2afbiS'];
      for (const pattern of reviewPatterns) {
        const reviewIndex = html.indexOf(pattern);
        if (reviewIndex > -1) {
          const reviewSection = html.substring(reviewIndex, reviewIndex + 300);
          const reviewMatch = reviewSection.match(/([0-9,]+)\s*(reviews?|ratings?)/i);
          if (reviewMatch) {
            productData.reviews = reviewMatch[1] + " reviews";
            console.log(`✅ [v${BOT_VERSION}] Reviews: ${productData.reviews}`);
            break;
          }
        }
      }
    } catch (error) {
      console.log(`⚠️ [v${BOT_VERSION}] Reviews/ratings extraction failed, using defaults`);
    }

    // Extract specifications (memory, display, etc. as mentioned in video)
    console.log(`🔍 [v${BOT_VERSION}] Extracting specifications...`);
    try {
      const specPatterns = ['_21lJbe', '_1AN87F', 'tVe95H'];
      for (const pattern of specPatterns) {
        const specIndex = html.indexOf(pattern);
        if (specIndex > -1) {
          const specSection = html.substring(specIndex, specIndex + 500);
          const specs = [];
          
          // Look for common specs
          if (specSection.includes('GB')) {
            const memoryMatch = specSection.match(/(\d+\s*GB)/g);
            if (memoryMatch) specs.push("Memory: " + memoryMatch[0]);
          }
          
          if (specSection.includes('inch') || specSection.includes('"')) {
            const displayMatch = specSection.match(/(\d+\.?\d*\s*inch|\d+\.?\d*")/);
            if (displayMatch) specs.push("Display: " + displayMatch[0]);
          }

          if (specs.length > 0) {
            productData.specifications = specs.join(", ");
            console.log(`✅ [v${BOT_VERSION}] Specs: ${productData.specifications}`);
            break;
          }
        }
      }
    } catch (error) {
      console.log(`⚠️ [v${BOT_VERSION}] Specifications extraction failed`);
    }

    // Extract offers and discounts (handle cases with no offers as mentioned in video)
    console.log(`🔍 [v${BOT_VERSION}] Extracting offers...`);
    try {
      const offerPatterns = ['_2ZdXDB', '_3tbMfx', '_16FRp0'];
      for (const pattern of offerPatterns) {
        const offerIndex = html.indexOf(pattern);
        if (offerIndex > -1) {
          const offerSection = html.substring(offerIndex, offerIndex + 300);
          const offerMatch = offerSection.match(/(₹[0-9,]+\s*off|\d+%\s*off|Bank Offer|Exchange Offer)/i);
          if (offerMatch) {
            productData.offers = offerMatch[1];
            console.log(`✅ [v${BOT_VERSION}] Offer: ${productData.offers}`);
            break;
          }
        }
      }
    } catch (error) {
      console.log(`⚠️ [v${BOT_VERSION}] Offers extraction failed`);
    }

    // Final validation and return
    productData.timestamp = new Date().toISOString();
    productData.url = url;
    
    console.log(`🎯 [v${BOT_VERSION}] Final Flipkart data:`, {
      title: productData.title.substring(0, 30) + "...",
      sellingPrice: productData.sellingPrice,
      actualPrice: productData.actualPrice,
      success: productData.success
    });
    
    return productData;

  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Flipkart scraping error:`, error);
    return {
      title: "Flipkart Product",
      actualPrice: "Unable to fetch",
      sellingPrice: "Unable to fetch", 
      reviews: "No reviews",
      ratings: "No ratings",
      specifications: "Not available",
      offers: "No offers available",
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      url: url
    };
  }
}

function formatFlipkartMessage(productInfo, url) {
  const timestamp = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  if (productInfo.success) {
    // Calculate discount if both prices available
    let discountInfo = "";
    if (productInfo.actualPrice !== "Not available" && productInfo.sellingPrice !== "Not available") {
      try {
        const actual = parseInt(productInfo.actualPrice.replace(/,/g, ''));
        const selling = parseInt(productInfo.sellingPrice.replace(/,/g, ''));
        if (actual > selling) {
          const discount = Math.round(((actual - selling) / actual) * 100);
          discountInfo = `\n💸 *Discount:* ${discount}% off (Save ₹${(actual - selling).toLocaleString()})`;
        }
      } catch (e) {
        console.log("Discount calculation failed");
      }
    }

    return `🛒 *Flipkart Product Successfully Extracted!* ✅

🏷️ *Product:* ${productInfo.title}

💰 *Pricing Details:*
• *Selling Price:* ₹${productInfo.sellingPrice}
• *Actual Price:* ₹${productInfo.actualPrice}${discountInfo}

⭐ *Reviews & Ratings:*
• *Rating:* ${productInfo.ratings}  
• *Reviews:* ${productInfo.reviews}

📋 *Specifications:* ${productInfo.specifications}

🎁 *Offers:* ${productInfo.offers}

🔗 [View on Flipkart](${url})

📊 *Status:* Advanced extraction successful
🕒 *Fetched:* ${timestamp}
🤖 *Bot:* v${BOT_VERSION}

*Comprehensive Flipkart data extracted!* 📈✨`;

  } else {
    return `⚠️ *Partial Flipkart Data Retrieved*

🏷️ *Product:* ${productInfo.title}
💰 *Selling Price:* ₹${productInfo.sellingPrice}
💰 *Actual Price:* ₹${productInfo.actualPrice}
⭐ *Reviews:* ${productInfo.reviews}
⭐ *Ratings:* ${productInfo.ratings}

🔗 [View Product on Flipkart](${url})

ℹ️ *Note:* Some data may be limited due to page structure or anti-scraping measures
🕒 *Attempted:* ${timestamp}
🤖 *Bot:* v${BOT_VERSION}

*You can still view the complete product on Flipkart!* 🛒`;
  }
}

async function tgSendMessage(token, payload) {
  if (!token) {
    console.error(`❌ [v${BOT_VERSION}] Bot token missing`);
    throw new Error("Bot token not configured");
  }

  const api = `https://api.telegram.org/bot${token}/sendMessage`;
  
  try {
    const response = await fetch(api, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const result = await response.text();
    console.log(`📨 [v${BOT_VERSION}] Telegram response: ${response.status}`);
    return result;
    
  } catch (error) {
    console.error(`❌ [v${BOT_VERSION}] Telegram API error:`, error);
    throw error;
  }
}
