const slugify = require('slugify');
const { OpenAI } = require('openai');
const { pool } = require('../../config/database');

// Helper to get OpenAI config from res_options
const OpenAIOptionNames = {
  ApiKey: "openai_api_key",
  Model: "openai_model",
  MaxTokens: "openai_max_tokens",
  Temperature: "openai_temperature",
  Enabled: "openai_enabled",
  OrganizationId: "openai_organization_id",
  Timeout: "openai_timeout",
  RetryAttempts: "openai_retry_attempts",
  RetryDelay: "openai_retry_delay",
  LogLevel: "openai_log_level"
};

async function getOpenAIConfig() {
  try {
    const [rows] = await pool.execute(
      `SELECT option_name, option_value FROM res_options WHERE option_name IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        OpenAIOptionNames.ApiKey,
        OpenAIOptionNames.Model,
        OpenAIOptionNames.MaxTokens,
        OpenAIOptionNames.Temperature,
        OpenAIOptionNames.Enabled,
        OpenAIOptionNames.OrganizationId,
        OpenAIOptionNames.Timeout,
        OpenAIOptionNames.RetryAttempts,
        OpenAIOptionNames.RetryDelay,
        OpenAIOptionNames.LogLevel
      ]
    );
    
    const config = {};
    rows.forEach(row => {
      config[row.option_name] = row.option_value;
    });
    
    return config;
  } catch (error) {
    console.error('Error fetching OpenAI config from database:', error);
    throw error;
  }
}

// Initialize OpenAI client with database config
let openai = null;

async function initializeOpenAI() {
  try {
    const config = await getOpenAIConfig();
    
    // Check if OpenAI is enabled
    if (config[OpenAIOptionNames.Enabled] !== '1') {
      console.log('OpenAI is disabled in settings');
      return null;
    }
    
    const openaiConfig = {
      apiKey: config[OpenAIOptionNames.ApiKey],
    };
    
    // Add optional organization ID if present
    if (config[OpenAIOptionNames.OrganizationId]) {
      openaiConfig.organization = config[OpenAIOptionNames.OrganizationId];
    }
    
    // Add timeout if specified
    if (config[OpenAIOptionNames.Timeout]) {
      openaiConfig.timeout = parseInt(config[OpenAIOptionNames.Timeout]);
    }
    
    openai = new OpenAI(openaiConfig);
    return openai;
  } catch (error) {
    console.error('Error initializing OpenAI client:', error);
    return null;
  }
}

// 🔁 Universal SEO Prompt Generator
const generateGenericSEOPrompt = (text) => {
  return `You are a professional SEO content generator. Your job is to return a structured and valid **JSON object** for any topic, based on the input title.

📄 Input Title: "${text}"

🎯 Objective:
Generate a clean, SEO-optimized JSON structure with the following fields:
{
  "title": "",              // Full title including relevant keywords
  "slug": "",               // SEO slug like: input-title-keywords
  "description": "",        // 250–400 characters providing a short, clear, and technically accurate description. Focus on main function, specific features, compatibility, platform requirements, pricing model, and mention any risks/limitations or important disclaimers. Do not mention official websites, download sources, or any download-related terms.
  "tags": [],               // At least 10 related SEO-friendly keywords
  "meta_title": "",         // Meta title (≤60 characters)
  "meta_description": "",   // Meta description (150–160 characters)
  "meta_keywords": [],      // 5–10 relevant search terms
  "body": ""                // Rich 500–800 word HTML content with sections, formatting, and semantic structure
}

🧠 Guidelines:
- Use the input exactly as given — do not change the brand or topic
- Research and use the latest information from original sources on the internet for accuracy
- For the description field: Write a short, clear, and technically accurate description that includes:
  * Main function and primary purpose
  * Specific technical features and capabilities
  * Platform compatibility (Windows, Mac, iOS, Android, etc.)
  * Supported versions or system requirements (use current/latest versions)
  * Pricing model (free, paid, subscription, etc.)
  * Target users or use cases
  * Any risks, limitations, or important disclaimers
  * Legal status or official support information
- Do not mention official websites, download sources, or external links
- Do not mention "free download", "download", or any download-related terms
- Ensure all information is current and up-to-date from reliable sources
- Tailor the tone based on the topic (technical, educational, product-based, etc.)
- Include relevant <h2>, <ul>, <ol>, <dl>, <strong> tags
- Use emojis in headings where appropriate to make it engaging
- Include FAQs (3-5 common questions with answers)
- Highlight long-tail phrases: e.g., "${text} benefits", "how to use ${text}", "buy ${text} online", "${text} features", "what is ${text}"

📝 Description Examples:
- For "iRemovalPro Tool": "iRemovalPro is a paid Windows tool that bypasses iCloud Activation Lock on iPhones and iPads using modified checkm8-based exploits like iRa1n. Compatible with iOS versions up to iOS 17, it restores SIM/signal functionality. Note: Not officially supported by Apple and provides temporary bypass status."
- For "Adobe Photoshop": "Adobe Photoshop is a professional image editing software for Windows and Mac. Features include advanced photo manipulation, layer-based editing, AI-powered tools, and extensive plugin support. Available via subscription model. Industry standard for graphic designers and photographers."
- For "Product Manual PDF": "Comprehensive product manual in PDF format containing detailed setup instructions, troubleshooting guides, maintenance procedures, and safety information. Compatible with all PDF readers. Includes warranty information and customer support details."

🛑 Output must be a valid JSON object only — no explanations, no markdown

🕐 Request ID: ${Date.now()}-${Math.floor(Math.random() * 10000)}`;
};

// 🔧 SEO Content Generator Endpoint
const generateUniversalSEOContent = async (req, res) => {
  try {
    const { text } = req.body;
    
    // Initialize OpenAI client with database config
    const openaiClient = await initializeOpenAI();
    
    if (!openaiClient) {
      return res.status(500).json({
        success: false,
        message: 'OpenAI is not configured or disabled. Please check your settings.',
      });
    }
    
    const config = await getOpenAIConfig();
    const prompt = generateGenericSEOPrompt(text);

    const completion = await openaiClient.chat.completions.create({
      model: config[OpenAIOptionNames.Model] || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert technical content writer specializing in software tools, applications, and digital products. Your job is to generate accurate, detailed, and technically precise descriptions in valid JSON format. Always research and use the latest information from original sources on the internet to ensure accuracy. Include specific technical details, compatibility information, pricing models, and any important disclaimers or limitations. Be factual and avoid marketing fluff. Verify current versions, features, and specifications from official sources.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: parseFloat(config[OpenAIOptionNames.Temperature]) || 0.3,
      max_tokens: parseInt(config[OpenAIOptionNames.MaxTokens]) || 2500,
      response_format: { type: 'json_object' },
    });

    const generatedContent = completion.choices[0].message.content;

    let seoContent;
    try {
      seoContent = JSON.parse(generatedContent);

      // Sanitize fields
      seoContent.title = seoContent.title?.trim() || '';
      seoContent.description = seoContent.description?.trim() || '';
      seoContent.meta_title = seoContent.meta_title?.trim() || '';
      seoContent.meta_description = seoContent.meta_description?.trim() || '';
      seoContent.body = seoContent.body?.trim() || '';
      seoContent.slug = seoContent.slug?.trim() || '';

      seoContent.tags = Array.isArray(seoContent.tags)
        ? seoContent.tags.map(tag => tag.trim()).filter(Boolean)
        : [];

      seoContent.meta_keywords = Array.isArray(seoContent.meta_keywords)
        ? seoContent.meta_keywords.map(kw => kw.trim()).filter(Boolean)
        : [];

      // Length limits
      if (seoContent.title.length > 200) seoContent.title = seoContent.title.slice(0, 197) + '...';
      if (seoContent.meta_title.length > 60) seoContent.meta_title = seoContent.meta_title.slice(0, 57) + '...';
      // Keep full description without truncation
      if (seoContent.meta_description.length > 160) seoContent.meta_description = seoContent.meta_description.slice(0, 157) + '...';
      if (seoContent.body.length > 8000) seoContent.body = seoContent.body.slice(0, 7997) + '...';

      // Slug fallback
      const isValidSlug = /^[a-z0-9-]+$/.test(seoContent.slug);
      seoContent.slug = isValidSlug
        ? seoContent.slug
        : slugify(seoContent.slug || seoContent.title || text, {
            lower: true,
            strict: true,
            remove: /[*+~.()'"!:@]/g,
          });

      if (seoContent.slug.length > 120) seoContent.slug = seoContent.slug.slice(0, 117) + '...';

      return res.status(200).json({
        success: true,
        data: seoContent,
      });
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      console.error('Raw content:', generatedContent);
      return res.status(500).json({
        success: false,
        message: 'Error parsing generated content',
        error: parseError.message,
      });
    }
  } catch (apiError) {
    console.error('OpenAI API Error:', apiError);
    return res.status(500).json({
      success: false,
      message: 'Error generating SEO content',
      error: apiError.message,
    });
  }
};

// Get all OpenAI settings from database
const getOpenAISettings = async (req, res) => {
  try {
    const config = await getOpenAIConfig();
    
    return res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('Error fetching OpenAI settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching OpenAI settings',
      error: error.message,
    });
  }
};

module.exports = {
  generateUniversalSEOContent,
  getOpenAISettings,
  getOpenAIConfig, // Export for use in other modules
};
