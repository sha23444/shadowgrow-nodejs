const { pool } = require("../../config/database");
const { clearProductCache } = require("../../config/smart-cache");

async function addProduct(req, res) {
  const {
    product_name,
    sku = null,
    slug,
    original_price,
    sale_price = null,
    stock_quantity = null,
    short_description = null,
    description = null,
    manufacturer = null,
    supplier = null,
    supplier_id = null,
    status = 1,
    product_type = 1,
    // New delivery method fields
    delivery_method = 1,
    shipping_cost = null,
    free_shipping_threshold = null,
    estimated_delivery_days = null,
    requires_shipping_address = true,
    is_digital_download = false,
    requires_activation_key = false,
    requires_manual_processing = false,
    digital_file_url = null,
    digital_delivery_time = null,
    delivery_instructions = null,
    download_limit = null,
    download_expiry_days = null,
    track_inventory = true,
    allow_backorder = false,
    low_stock_threshold = null,
    weight = null,
    length = null,
    width = null,
    height = null,
    is_featured = 0,
    rating = 0,
    reviews_count = 0,
    // Service-specific fields removed (set to null)
    // duration, service_type, requires_consultation, is_customizable, service_location_type, is_service_available
    media = [],
    categories = [],
    tags = [],
    newCategories = [],
    newTags = [],
    variants,
    attributes,
    fields = [],
    activation_keys = null,
  } = req.body;

  // Validate and convert numeric fields
  let validatedStockQuantity = stock_quantity === '' || stock_quantity === null ? null : parseInt(stock_quantity);
  
  // For variant products, original_price can be empty
  let validatedOriginalPrice = null;
  if (original_price !== '' && original_price !== null && original_price !== undefined) {
    validatedOriginalPrice = parseFloat(original_price);
    if (isNaN(validatedOriginalPrice)) {
      validatedOriginalPrice = null;
    }
  }
  
  // Validate sale price
  let validatedSalePrice = null;
  if (sale_price !== '' && sale_price !== null && sale_price !== undefined) {
    validatedSalePrice = parseFloat(sale_price);
    if (isNaN(validatedSalePrice) || validatedSalePrice < 0) {
      return res.status(400).json({ 
        error: "Sale price must be a valid positive number if provided." 
      });
    }
    
    // If sale price is provided and original price exists, sale price should be less than original price
    if (validatedOriginalPrice !== null && validatedSalePrice > validatedOriginalPrice) {
      return res.status(400).json({ 
        error: "Sale price cannot be greater than original price." 
      });
    }
  }
  const validatedShippingCost = shipping_cost === '' || shipping_cost === null ? null : parseFloat(shipping_cost);
  const validatedFreeShippingThreshold = free_shipping_threshold === '' || free_shipping_threshold === null ? null : parseFloat(free_shipping_threshold);
  const validatedEstimatedDeliveryDays = estimated_delivery_days === '' || estimated_delivery_days === null ? null : parseInt(estimated_delivery_days);
  // Validate download_limit (must be positive integer if provided)
  let validatedDownloadLimit = null;
  if (download_limit !== '' && download_limit !== null && download_limit !== undefined) {
    const parsed = parseInt(download_limit);
    if (isNaN(parsed) || parsed < 1) {
      return res.status(400).json({ 
        error: "Download limit must be a positive integer (1 or greater) if provided." 
      });
    }
    validatedDownloadLimit = parsed;
  }

  // Validate download_expiry_days (must be positive integer if provided)
  let validatedDownloadExpiryDays = null;
  if (download_expiry_days !== '' && download_expiry_days !== null && download_expiry_days !== undefined) {
    const parsed = parseInt(download_expiry_days);
    if (isNaN(parsed) || parsed < 1) {
      return res.status(400).json({ 
        error: "Download expiry days must be a positive integer (1 or greater) if provided." 
      });
    }
    validatedDownloadExpiryDays = parsed;
  }

  // Validate digital_delivery_time (string, max 255 chars if provided)
  let validatedDigitalDeliveryTime = null;
  if (digital_delivery_time !== null && digital_delivery_time !== undefined && digital_delivery_time !== '') {
    if (typeof digital_delivery_time !== 'string' || digital_delivery_time.length > 255) {
      return res.status(400).json({ 
        error: "Digital delivery time must be a string with maximum 255 characters." 
      });
    }
    validatedDigitalDeliveryTime = digital_delivery_time.trim();
  }

  // Validate delivery_instructions (text field, max 5000 chars if provided)
  let validatedDeliveryInstructions = null;
  if (delivery_instructions !== null && delivery_instructions !== undefined && delivery_instructions !== '') {
    if (typeof delivery_instructions !== 'string' || delivery_instructions.length > 5000) {
      return res.status(400).json({ 
        error: "Delivery instructions must be a string with maximum 5000 characters." 
      });
    }
    validatedDeliveryInstructions = delivery_instructions.trim();
  }

  // Validate digital_file_url (must be valid URL if provided)
  let validatedDigitalFileUrl = null;
  if (digital_file_url !== null && digital_file_url !== undefined && digital_file_url !== '') {
    if (typeof digital_file_url !== 'string') {
      return res.status(400).json({ 
        error: "Digital file URL must be a string." 
      });
    }
    const trimmedUrl = digital_file_url.trim();
    // Basic URL validation
    try {
      new URL(trimmedUrl);
      validatedDigitalFileUrl = trimmedUrl;
    } catch (urlError) {
      return res.status(400).json({ 
        error: "Digital file URL must be a valid URL format." 
      });
    }
  }
  const validatedLowStockThreshold = low_stock_threshold === '' || low_stock_threshold === null ? null : parseInt(low_stock_threshold);
  const validatedWeight = weight === '' || weight === null ? null : parseFloat(weight);
  const validatedLength = length === '' || length === null ? null : parseFloat(length);
  const validatedWidth = width === '' || width === null ? null : parseFloat(width);
  const validatedHeight = height === '' || height === null ? null : parseFloat(height);

  // Convert product_type string to stored value
  let validatedProductType = product_type;
  if (typeof product_type === 'string') {
    const productTypeMap = {
      'physical': 'physical',
      'digital': 'digital',
    };
    validatedProductType = productTypeMap[product_type] || product_type;
  }

  // Handle supplier_id or supplier
  let supplierValue = supplier;
  if (supplier_id && !supplier) {
    // If supplier_id is provided, fetch supplier name from database
    try {
      const [supplierRows] = await pool.execute(
        "SELECT supplier_name FROM res_suppliers WHERE supplier_id = ?",
        [supplier_id]
      );
      if (supplierRows.length > 0) {
        supplierValue = supplierRows[0].supplier_name;
      }
    } catch (error) {
      console.log("Could not fetch supplier name, using provided supplier");
    }
  }

  // Check if variants are provided
  const hasVariants = variants && variants.length > 0;
  
  // Determine product type
  const isDigitalProduct = is_digital_download === true || validatedProductType === 'digital';
  const isPhysicalProduct = validatedProductType === 'physical';
  
  // For variant products, original_price and stock_quantity are optional
  // For single products, both are required unless it's digital or service
  if (!product_name) {
    return res.status(400).json({ error: "product_name is required." });
  }
  
  if (!hasVariants) {
    // For single products without variants, original_price is required (except digital where it can be 0)
    if (validatedOriginalPrice === null && !isDigitalProduct) {
      return res.status(400).json({ error: "Missing required fields or invalid price. original_price is required for non-variant products." });
    }
    
    // stock_quantity is required for physical products, optional for digital
    if (validatedStockQuantity === null && isPhysicalProduct) {
      return res.status(400).json({ error: "stock_quantity is required for non-variant physical products." });
    }
    
    // For digital products without variants, set stock_quantity to 0 if not provided
    if (validatedStockQuantity === null && isDigitalProduct) {
      validatedStockQuantity = 0;
    }
  } else {
    // For variant products, set defaults if not provided
    if (validatedOriginalPrice === null) {
      validatedOriginalPrice = 0.00;
    }
    // For variant products, stock_quantity defaults to 0
    if (validatedStockQuantity === null) {
      validatedStockQuantity = 0;
    }
  }

  // Validate stock quantity if provided
  if (validatedStockQuantity !== null && (isNaN(validatedStockQuantity) || validatedStockQuantity < 0)) {
    return res.status(400).json({ 
      error: "Invalid stock quantity. Please provide a valid positive number or zero." 
    });
  }

  // Validate delivery method
  if (![1, 2, 3].includes(delivery_method)) {
    return res.status(400).json({ 
      error: "Invalid delivery method. Must be 1 (Shipping), 2 (Instant Delivery), or 3 (Both)" 
    });
  }

  // Validate numeric fields with specific error messages
  const numericFields = [
    { value: validatedShippingCost, name: 'shipping_cost', label: 'Shipping Cost' },
    { value: validatedFreeShippingThreshold, name: 'free_shipping_threshold', label: 'Free Shipping Threshold' },
    { value: validatedEstimatedDeliveryDays, name: 'estimated_delivery_days', label: 'Estimated Delivery Days' },
    { value: validatedDownloadLimit, name: 'download_limit', label: 'Download Limit' },
    { value: validatedDownloadExpiryDays, name: 'download_expiry_days', label: 'Download Expiry Days' },
    { value: validatedLowStockThreshold, name: 'low_stock_threshold', label: 'Low Stock Threshold' },
    { value: validatedWeight, name: 'weight', label: 'Weight' },
    { value: validatedLength, name: 'length', label: 'Length' },
    { value: validatedWidth, name: 'width', label: 'Width' },
    { value: validatedHeight, name: 'height', label: 'Height' }
  ];

  for (const field of numericFields) {
    if (field.value !== null && (isNaN(field.value) || field.value < 0)) {
      return res.status(400).json({ 
        error: `${field.label} must be a valid positive number or zero` 
      });
    }
  }

  // Validate slug format
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return res.status(400).json({ 
      error: "Invalid slug format. Slug must contain only lowercase letters, numbers, and hyphens (e.g., 'product-name-123')" 
    });
  }

  // Service-specific validations removed

  // Generate SKU if not provided
  let finalSku = sku;
  if (!sku || sku === '') {
    const timestamp = Date.now();
    finalSku = `AUTO-${timestamp}`;
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  const categoriesIds = categories.map((c) => c.category_id);
  const tagsIds = tags.map((t) => t.tag_id);

  try {
    const [result] = await connection.execute(
      `INSERT INTO res_products (
        product_name, sku, slug, original_price, sale_price, stock_quantity, short_description, description, manufacturer, supplier, 
        status, product_type, is_featured, rating, reviews_count, delivery_method, shipping_cost, free_shipping_threshold, estimated_delivery_days, requires_shipping_address,
        is_digital_download, requires_activation_key, requires_manual_processing, digital_file_url, digital_delivery_time, delivery_instructions, download_limit, download_expiry_days, track_inventory,
        allow_backorder, low_stock_threshold, weight, length, width, height, duration, service_type, requires_consultation, is_customizable, service_location_type, is_service_available
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product_name,
        finalSku,
        slug,
        validatedOriginalPrice,
        validatedSalePrice,
        validatedStockQuantity,
        short_description,
        description,
        manufacturer,
        supplierValue,
        status,
        validatedProductType,
        is_featured,
        rating,
        reviews_count,
        delivery_method,
        validatedShippingCost,
        validatedFreeShippingThreshold,
        validatedEstimatedDeliveryDays,
        requires_shipping_address,
        is_digital_download,
        requires_activation_key,
        validatedDigitalFileUrl !== null ? validatedDigitalFileUrl : digital_file_url,
        validatedDigitalDeliveryTime !== null ? validatedDigitalDeliveryTime : digital_delivery_time,
        validatedDeliveryInstructions !== null ? validatedDeliveryInstructions : delivery_instructions,
        validatedDownloadLimit,
        validatedDownloadExpiryDays,
        track_inventory,
        allow_backorder,
        validatedLowStockThreshold,
        validatedWeight,
        validatedLength,
        validatedWidth,
        validatedHeight,
        null, // duration
        null, // service_type
        null, // requires_consultation
        null, // is_customizable
        null, // service_location_type
        null, // is_service_available
      ]
    );

    const productId = result.insertId;

    // Insert new categories and generate slugs
    if (newCategories.length > 0) {
      for (const categoryName of newCategories) {
        const slug = categoryName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric characters with hyphens
          .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens

        const [insertedCategory] = await connection.execute(
          `INSERT INTO res_product_categories (category_name, slug) VALUES (?, ?)`,
          [categoryName, slug]
        );
        categories.push(insertedCategory.insertId);
      }
    }

    // Insert category relationships
    if (categoriesIds.length > 0) {
      const categoryQueries = categoriesIds.map((categoryId) =>
        connection.execute(
          `INSERT INTO res_product_category_relationship (product_id, category_id) VALUES (?, ?)`,
          [productId, categoryId]
        )
      );
      await Promise.all(categoryQueries);
    }

    // Insert new tags and generate slugs
    if (newTags.length > 0) {
      for (const tagName of newTags) {
        const slug = tagName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric characters with hyphens
          .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens

        const [insertedTag] = await connection.execute(
          `INSERT INTO res_product_tags (tag_name, slug) VALUES (?, ?)`,
          [tagName, slug]
        );
        tags.push(insertedTag.insertId);
      }
    }

    // Insert tag relationships
    if (tagsIds.length > 0) {
      const tagQueries = tagsIds.map((tagId) =>
        connection.execute(
          `INSERT INTO res_product_tag_relationship (product_id, tag_id) VALUES (?, ?)`,
          [productId, tagId]
        )
      );
      await Promise.all(tagQueries);
    }

    // Insert media, variants, attributes, and fields (as in your original code)
    if (media.length > 0) {
      const mediaQueries = media.map((mediaItem) =>
        connection.execute(
          `INSERT INTO res_product_media (product_id, type, file_name, is_cover) VALUES (?, ?, ?, ?)`,
          [productId, mediaItem.type, mediaItem.file_name, mediaItem.is_cover]
        )
      );
      await Promise.all(mediaQueries);
    }

    if (variants && variants.length > 0) {
      // Validate variants
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        
        // Validate variant name if provided
        if (!variant.variant_name && !variant.color && !variant.size) {
          return res.status(400).json({ 
            error: `Variant ${i + 1}: At least one identifier (variant_name, color, or size) is required.` 
          });
        }
        
        // Validate variant price if provided
        if (variant.variant_price !== null && variant.variant_price !== undefined && variant.variant_price !== '') {
          const variantPrice = parseFloat(variant.variant_price);
          if (isNaN(variantPrice) || variantPrice < 0) {
            return res.status(400).json({ 
              error: `Variant ${i + 1}: Invalid variant price. Must be a valid positive number.` 
            });
          }
        }
        
        // Validate variant stock quantity if provided
        if (variant.variant_stock_quantity !== null && variant.variant_stock_quantity !== undefined && variant.variant_stock_quantity !== '') {
          const variantStock = parseInt(variant.variant_stock_quantity);
          if (isNaN(variantStock) || variantStock < 0) {
            return res.status(400).json({ 
              error: `Variant ${i + 1}: Invalid stock quantity. Must be a valid positive number or zero.` 
            });
          }
        }
      }

      // Check for duplicate variant SKUs before inserting
      for (const variant of variants) {
        const variantSku = variant.variant_sku || variant.sku;
        if (variantSku) {
          const [existingVariants] = await connection.execute(
            'SELECT variant_id FROM res_product_variants WHERE variant_sku = ?',
            [variantSku]
          );
          if (existingVariants.length > 0) {
            // Generate a unique SKU if duplicate found
            variant.variant_sku = `${variantSku}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            variant.sku = variant.variant_sku;
          }
        }
      }

      const variantQueries = variants.map((variant) =>
        connection.execute(
          `INSERT INTO res_product_variants (
            product_id, variant_sku, variant_name, variant_price, variant_stock_quantity, color, size, material,
            weight, dimensions, variant_image_url, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            productId,
            variant.variant_sku || variant.sku || null,
            variant.variant_name || null,
            variant.variant_price || null,
            variant.variant_stock_quantity || null,
            variant.color || null,
            variant.size || null,
            variant.material || null,
            variant.weight || null,
            variant.dimensions || null,
            variant.variant_image_url || variant.variant_image || null,
            variant.is_active || 1,
          ]
        )
      );
      await Promise.all(variantQueries);
    }

    if (attributes && attributes.length > 0) {
      const attributeQueries = attributes.map((attribute) =>
        connection.execute(
          `INSERT INTO res_product_attribute_relationship (product_id, attribute_id, value_id)
           VALUES (?, ?, ?)`,
          [productId, attribute.attribute_id, attribute.value_id]
        )
      );
      await Promise.all(attributeQueries);
    }

    if (fields && fields.length > 0) {
      const fieldQueries = fields.map((field) =>
        connection.execute(
          `INSERT INTO res_product_fields (product_id, field_name, field_type, is_required) VALUES (?, ?, ?, ?)`,
          [productId, field.field_name, field.field_type, field.is_required]
        )
      );
      await Promise.all(fieldQueries);
    }

    // Handle activation keys if provided
    if (activation_keys && activation_keys.trim() !== '') {
      // Parse activation keys (split by newline, comma, or other delimiters)
      const keys = activation_keys
        .split(/[\n,\r;]+/)
        .map(key => key.trim())
        .filter(key => key.length > 0);
      
      if (keys.length > 0) {
        // Create a batch for tracking (optional)
        const batchName = `Auto-generated batch ${new Date().toISOString()}`;
        const [batchResult] = await connection.execute(
          `INSERT INTO res_activation_key_batches (product_id, batch_name, total_keys, notes) 
           VALUES (?, ?, ?, ?)`,
          [productId, batchName, keys.length, 'Auto-generated during product creation']
        );

        // Insert each activation key
        for (const key of keys) {
          await connection.execute(
            `INSERT INTO res_product_activation_keys 
             (product_id, activation_key, key_type, description, status) 
             VALUES (?, ?, 'license', NULL, 'available')`,
            [productId, key]
          );
        }

        // Update product inventory based on activation keys count
        const ProductInventoryService = require('../../services/ProductInventoryService');
        await ProductInventoryService.updateProductInventory(productId, connection);
      }
    }

    // Update product inventory if it's a digital product (after digital_file_url or activation keys changes)
    if (is_digital_download === 1 || validatedProductType === 'digital') {
      const ProductInventoryService = require('../../services/ProductInventoryService');
      await ProductInventoryService.updateProductInventory(productId, connection);
    }

    await connection.commit();
    
    // Clear product cache after successful addition
    await clearProductCache();
    
    res.status(201).json({
      message: "Product added successfully",
      productId,
    });
  } catch (error) {
    console.error("Database error:", error);
    await connection.rollback();
    
    // Handle specific database errors
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('sku')) {
        return res.status(409).json({ 
          error: "Product SKU already exists. Please use a different SKU." 
        });
      } else if (error.message.includes('slug')) {
        return res.status(409).json({ 
          error: "Product slug already exists. Please use a different slug." 
        });
      } else if (error.message.includes('variant_sku')) {
        return res.status(409).json({ 
          error: "One or more variant SKUs already exist. Please use different SKUs." 
        });
      } else {
        return res.status(409).json({ 
          error: "Duplicate entry found. Please check your data." 
        });
      }
    }
    
    if (error.code === 'ER_DATA_TOO_LONG') {
      return res.status(400).json({ 
        error: "One or more fields exceed the maximum allowed length. Please check product name, description, and other text fields." 
      });
    }
    
    if (error.code === 'ER_BAD_NULL_ERROR') {
      return res.status(400).json({ 
        error: "Required fields cannot be null or empty." 
      });
    }
    
    if (error.code === 'ER_TRUNCATED_WRONG_VALUE') {
      return res.status(400).json({ 
        error: "Invalid data format provided. Please check numeric and date fields." 
      });
    }
    
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ 
        error: "Invalid reference data. Please check category IDs, tag IDs, or attribute values." 
      });
    }
    
    // Generic error for other cases
    res.status(500).json({ 
      error: "Failed to create product. Please try again or contact support if the problem persists." 
    });
  } finally {
    connection.release();
  }
}

async function updateProduct(req, res) {
  const { productId } = req.params;
  const product_id = parseInt(productId, 10);

  if (!productId) {
    return res.status(400).json({ error: "Product ID is required" });
  }

  const {
    product_name,
    sku,
    slug,
    original_price,
    sale_price = null,
    stock_quantity,
    short_description = null,
    description = null,
    manufacturer = null,
    supplier = null,
    supplier_name = null,
    supplier_id = null,
    status,
    product_type,
    // New delivery method fields
    delivery_method = 1,
    shipping_cost = null,
    free_shipping_threshold = null,
    estimated_delivery_days = null,
    requires_shipping_address = true,
    is_digital_download = false,
    requires_activation_key = false,
    requires_manual_processing = false,
    digital_file_url = null,
    digital_delivery_time = null,
    delivery_instructions = null,
    download_limit = null,
    download_expiry_days = null,
    track_inventory = true,
    allow_backorder = false,
    low_stock_threshold = null,
    weight = null,
    length = null,
    width = null,
    height = null,
    // Service-specific fields removed (set to null)
    media = [],
    tags = [],
    newTags = [],
    is_featured = 0,
    rating = 0,
    reviews_count = 0,
    categories = [],
    newCategories = [],
    variants,
    attributes,
    fields = [],
    activation_keys = null,
  } = req.body;

  // Validate and convert numeric fields
  const validatedStockQuantity = stock_quantity === '' || stock_quantity === null ? null : parseInt(stock_quantity);
  const validatedOriginalPrice = parseFloat(original_price);
  
  // Validate sale price
  let validatedSalePrice = null;
  if (sale_price !== '' && sale_price !== null && sale_price !== undefined) {
    validatedSalePrice = parseFloat(sale_price);
    if (isNaN(validatedSalePrice) || validatedSalePrice < 0) {
      return res.status(400).json({ 
        error: "Sale price must be a valid positive number if provided." 
      });
    }
    
    // If sale price is provided and original price exists, sale price should be less than original price
    if (validatedOriginalPrice !== null && !isNaN(validatedOriginalPrice) && validatedSalePrice > validatedOriginalPrice) {
      return res.status(400).json({ 
        error: "Sale price cannot be greater than original price." 
      });
    }
  }
  const validatedShippingCost = shipping_cost === '' || shipping_cost === null ? null : parseFloat(shipping_cost);
  const validatedFreeShippingThreshold = free_shipping_threshold === '' || free_shipping_threshold === null ? null : parseFloat(free_shipping_threshold);
  const validatedEstimatedDeliveryDays = estimated_delivery_days === '' || estimated_delivery_days === null ? null : parseInt(estimated_delivery_days);
  // Validate download_limit (must be positive integer if provided)
  let validatedDownloadLimit = null;
  if (download_limit !== '' && download_limit !== null && download_limit !== undefined) {
    const parsed = parseInt(download_limit);
    if (isNaN(parsed) || parsed < 1) {
      return res.status(400).json({ 
        error: "Download limit must be a positive integer (1 or greater) if provided." 
      });
    }
    validatedDownloadLimit = parsed;
  }

  // Validate download_expiry_days (must be positive integer if provided)
  let validatedDownloadExpiryDays = null;
  if (download_expiry_days !== '' && download_expiry_days !== null && download_expiry_days !== undefined) {
    const parsed = parseInt(download_expiry_days);
    if (isNaN(parsed) || parsed < 1) {
      return res.status(400).json({ 
        error: "Download expiry days must be a positive integer (1 or greater) if provided." 
      });
    }
    validatedDownloadExpiryDays = parsed;
  }

  // Validate digital_delivery_time (string, max 255 chars if provided)
  let validatedDigitalDeliveryTime = null;
  if (digital_delivery_time !== null && digital_delivery_time !== undefined && digital_delivery_time !== '') {
    if (typeof digital_delivery_time !== 'string' || digital_delivery_time.length > 255) {
      return res.status(400).json({ 
        error: "Digital delivery time must be a string with maximum 255 characters." 
      });
    }
    validatedDigitalDeliveryTime = digital_delivery_time.trim();
  }

  // Validate delivery_instructions (text field, max 5000 chars if provided)
  let validatedDeliveryInstructions = null;
  if (delivery_instructions !== null && delivery_instructions !== undefined && delivery_instructions !== '') {
    if (typeof delivery_instructions !== 'string' || delivery_instructions.length > 5000) {
      return res.status(400).json({ 
        error: "Delivery instructions must be a string with maximum 5000 characters." 
      });
    }
    validatedDeliveryInstructions = delivery_instructions.trim();
  }

  // Validate digital_file_url (must be valid URL if provided)
  let validatedDigitalFileUrl = null;
  if (digital_file_url !== null && digital_file_url !== undefined && digital_file_url !== '') {
    if (typeof digital_file_url !== 'string') {
      return res.status(400).json({ 
        error: "Digital file URL must be a string." 
      });
    }
    const trimmedUrl = digital_file_url.trim();
    // Basic URL validation
    try {
      new URL(trimmedUrl);
      validatedDigitalFileUrl = trimmedUrl;
    } catch (urlError) {
      return res.status(400).json({ 
        error: "Digital file URL must be a valid URL format." 
      });
    }
  }
  const validatedLowStockThreshold = low_stock_threshold === '' || low_stock_threshold === null ? null : parseInt(low_stock_threshold);
  const validatedWeight = weight === '' || weight === null ? null : parseFloat(weight);
  const validatedLength = length === '' || length === null ? null : parseFloat(length);
  const validatedWidth = width === '' || width === null ? null : parseFloat(width);
  const validatedHeight = height === '' || height === null ? null : parseFloat(height);

  // Validate product ID
  if (isNaN(product_id) || product_id <= 0) {
    return res.status(400).json({ 
      error: "Invalid product ID. Product ID must be a valid positive number." 
    });
  }

  // Determine product type
  const validatedProductType = product_type;
  const isDigitalProduct = validatedProductType === 'digital';
  const isPhysicalProduct = validatedProductType === 'physical';

  // Validate required fields
  if (!product_name) {
    return res.status(400).json({ 
      error: "Product name is required." 
    });
  }

  if (!original_price || isNaN(validatedOriginalPrice)) {
    return res.status(400).json({ 
      error: "Original price is required and must be a valid number." 
    });
  }

  if (validatedOriginalPrice < 0) {
    return res.status(400).json({ 
      error: "Original price cannot be negative." 
    });
  }

  if (!status || ![1, 2, 3, 4].includes(parseInt(status))) {
    return res.status(400).json({ 
      error: "Invalid status. Status must be 1 (Draft), 2 (Active), 3 (Inactive), or 4 (Archived)." 
    });
  }

  // Validate stock quantity if provided
  if (validatedStockQuantity !== null && (isNaN(validatedStockQuantity) || validatedStockQuantity < 0)) {
    return res.status(400).json({ 
      error: "Invalid stock quantity. Please provide a valid positive number or zero." 
    });
  }

  // Validate delivery method
  if (![1, 2, 3].includes(delivery_method)) {
    return res.status(400).json({ 
      error: "Invalid delivery method. Must be 1 (Shipping), 2 (Instant Delivery), or 3 (Both)" 
    });
  }

  // Validate numeric fields with specific error messages
  const numericFields = [
    { value: validatedShippingCost, name: 'shipping_cost', label: 'Shipping Cost' },
    { value: validatedFreeShippingThreshold, name: 'free_shipping_threshold', label: 'Free Shipping Threshold' },
    { value: validatedEstimatedDeliveryDays, name: 'estimated_delivery_days', label: 'Estimated Delivery Days' },
    { value: validatedDownloadLimit, name: 'download_limit', label: 'Download Limit' },
    { value: validatedDownloadExpiryDays, name: 'download_expiry_days', label: 'Download Expiry Days' },
    { value: validatedLowStockThreshold, name: 'low_stock_threshold', label: 'Low Stock Threshold' },
    { value: validatedWeight, name: 'weight', label: 'Weight' },
    { value: validatedLength, name: 'length', label: 'Length' },
    { value: validatedWidth, name: 'width', label: 'Width' },
    { value: validatedHeight, name: 'height', label: 'Height' }
  ];

  for (const field of numericFields) {
    if (field.value !== null && (isNaN(field.value) || field.value < 0)) {
      return res.status(400).json({ 
        error: `${field.label} must be a valid positive number or zero` 
      });
    }
  }

  // Validate slug format
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return res.status(400).json({ 
      error: "Invalid slug format. Slug must contain only lowercase letters, numbers, and hyphens (e.g., 'product-name-123')" 
    });
  }

  // Service-specific validations removed

  // Validate supplier if provided
  let supplierName = null;
  let supplierId = null;

  // Handle different supplier input formats
  if (supplier_id && typeof supplier_id === 'number') {
    // If supplier_id is provided, fetch supplier name from database
    const [supplierCheck] = await pool.execute(
      "SELECT supplier_id, supplier_name FROM res_suppliers WHERE supplier_id = ? AND status = 'active'",
      [supplier_id]
    );
    
    if (supplierCheck.length === 0) {
      return res.status(400).json({ 
        error: `Supplier with ID ${supplier_id} not found or is inactive. Please select a valid active supplier.` 
      });
    }
    
    supplierName = supplierCheck[0].supplier_name;
    supplierId = supplierCheck[0].supplier_id;
  } else if (supplier_name && typeof supplier_name === 'string' && supplier_name.trim() !== '') {
    supplierName = supplier_name.trim();
  } else if (supplier && typeof supplier === 'object' && supplier.supplier_name) {
    supplierName = supplier.supplier_name.trim();
  } else if (supplier && typeof supplier === 'string' && supplier.trim() !== '') {
    supplierName = supplier.trim();
  }

  // If we have supplier name but no ID, validate the supplier exists
  if (supplierName && !supplierId) {
    const [supplierCheck] = await pool.execute(
      "SELECT supplier_id FROM res_suppliers WHERE supplier_name = ? AND status = 'active'",
      [supplierName]
    );
    
    if (supplierCheck.length === 0) {
      return res.status(400).json({ 
        error: `Supplier "${supplierName}" not found or is inactive. Please select a valid active supplier.` 
      });
    }
    
    supplierId = supplierCheck[0].supplier_id;
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  const categoriesIds = categories.map((c) => c.category_id);
  const tagsIds = tags.map((t) => t.tag_id);

  try {
    // Check if product exists
    const [existingProduct] = await connection.execute(
      `SELECT product_id FROM res_products WHERE product_id = ?`,
      [product_id]
    );

    if (existingProduct.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        error: `Product with ID ${product_id} not found. Please verify the product ID and try again.` 
      });
    }

    // Update product information
    await connection.execute(
      `UPDATE res_products SET
        product_name = ?, sku = ?, slug = ?, original_price = ?, sale_price = ?, stock_quantity = ?, short_description = ?, description = ?, 
        manufacturer = ?, supplier = ?, status = ?, product_type = ?, is_featured = ?, rating = ?, reviews_count = ?,
        delivery_method = ?, shipping_cost = ?, free_shipping_threshold = ?, estimated_delivery_days = ?, requires_shipping_address = ?,
        is_digital_download = ?, requires_activation_key = ?, requires_manual_processing = ?, digital_file_url = ?, digital_delivery_time = ?, delivery_instructions = ?, download_limit = ?, download_expiry_days = ?,
        track_inventory = ?, allow_backorder = ?, low_stock_threshold = ?, weight = ?, length = ?, width = ?, height = ?,
        duration = ?, service_type = ?, requires_consultation = ?, is_customizable = ?, service_location_type = ?, is_service_available = ?
        WHERE product_id = ?`,
      [
        product_name,
        sku,
        slug,
        validatedOriginalPrice,
        validatedSalePrice,
        validatedStockQuantity,
        short_description,
        description,
        manufacturer,
        supplierName,
        status,
        product_type,
        is_featured,
        rating,
        reviews_count,
        delivery_method,
        validatedShippingCost,
        validatedFreeShippingThreshold,
        validatedEstimatedDeliveryDays,
        requires_shipping_address,
        is_digital_download,
        requires_activation_key,
        requires_manual_processing,
        validatedDigitalFileUrl !== null ? validatedDigitalFileUrl : digital_file_url,
        validatedDigitalDeliveryTime !== null ? validatedDigitalDeliveryTime : digital_delivery_time,
        validatedDeliveryInstructions !== null ? validatedDeliveryInstructions : delivery_instructions,
        validatedDownloadLimit,
        validatedDownloadExpiryDays,
        track_inventory,
        allow_backorder,
        validatedLowStockThreshold,
        validatedWeight,
        validatedLength,
        validatedWidth,
        validatedHeight,
        null, // duration
        null, // service_type
        null, // requires_consultation
        null, // is_customizable
        null, // service_location_type
        null, // is_service_available
        product_id,
      ]
    );

    // Handle media
    if (media.length > 0) {
      await connection.execute(
        `DELETE FROM res_product_media WHERE product_id = ?`,
        [product_id]
      );
      const mediaQueries = media.map((mediaItem) =>
        connection.execute(
          `INSERT INTO res_product_media (product_id, type, file_name, is_cover) VALUES (?, ?, ?, ?)`,
          [product_id, mediaItem.type, mediaItem.file_name, mediaItem.is_cover]
        )
      );
      await Promise.all(mediaQueries);
    }

    // Insert new categories and generate slugs
    if (newCategories.length > 0) {
      for (const categoryName of newCategories) {
        const slug = categoryName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric characters with hyphens
          .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens

        const [insertedCategory] = await connection.execute(
          `INSERT INTO res_product_categories (category_name, slug) VALUES (?, ?)`,
          [categoryName, slug]
        );
        categoriesIds.push(insertedCategory.insertId);
      }
    }

    // Handle categories
    if (categoriesIds.length > 0) {
      await connection.execute(
        `DELETE FROM res_product_category_relationship WHERE product_id = ?`,
        [product_id]
      );
      const categoryQueries = categoriesIds.map((categoryId) =>
        connection.execute(
          `INSERT INTO res_product_category_relationship (product_id, category_id) VALUES (?, ?)`,
          [product_id, categoryId]
        )
      );
      await Promise.all(categoryQueries);
    }

    // Insert new tags and generate slugs
    if (newTags.length > 0) {
      for (const tagName of newTags) {
        const slug = tagName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric characters with hyphens
          .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens

        const [insertedTag] = await connection.execute(
          `INSERT INTO res_product_tags (tag_name, slug) VALUES (?, ?)`,
          [tagName, slug]
        );
        tagsIds.push(insertedTag.insertId);
      }
    }

    // Handle tags
    if (tagsIds.length > 0) {
      await connection.execute(
        `DELETE FROM res_product_tag_relationship WHERE product_id = ?`,
        [product_id]
      );
      const tagQueries = tagsIds.map((tagId) =>
        connection.execute(
          `INSERT INTO res_product_tag_relationship (product_id, tag_id) VALUES (?, ?)`,
          [product_id, tagId]
        )
      );
      await Promise.all(tagQueries);
    }

    // Handle variants
    if (variants && variants.length > 0) {
      // Validate variants
      for (let i = 0; i < variants.length; i++) {
        const variant = variants[i];
        
        // Validate variant name if provided
        if (!variant.variant_name && !variant.color && !variant.size) {
          return res.status(400).json({ 
            error: `Variant ${i + 1}: At least one identifier (variant_name, color, or size) is required.` 
          });
        }
        
        // Validate variant price if provided
        if (variant.variant_price !== null && variant.variant_price !== undefined && variant.variant_price !== '') {
          const variantPrice = parseFloat(variant.variant_price);
          if (isNaN(variantPrice) || variantPrice < 0) {
            return res.status(400).json({ 
              error: `Variant ${i + 1}: Invalid variant price. Must be a valid positive number.` 
            });
          }
        }
        
        // Validate variant stock quantity if provided
        if (variant.variant_stock_quantity !== null && variant.variant_stock_quantity !== undefined && variant.variant_stock_quantity !== '') {
          const variantStock = parseInt(variant.variant_stock_quantity);
          if (isNaN(variantStock) || variantStock < 0) {
            return res.status(400).json({ 
              error: `Variant ${i + 1}: Invalid stock quantity. Must be a valid positive number or zero.` 
            });
          }
        }
      }

      await connection.execute(
        `DELETE FROM res_product_variants WHERE product_id = ?`,
        [product_id]
      );
      const variantQueries = variants.map((variant) =>
        connection.execute(
          `INSERT INTO res_product_variants (
            product_id, variant_sku, variant_name, variant_price, variant_stock_quantity, color, size, material,
            weight, dimensions, variant_image_url, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            product_id,
            variant.variant_sku || null,
            variant.variant_name || null,
            variant.variant_price || null,
            variant.variant_stock_quantity || null,
            variant.color || null,
            variant.size || null,
            variant.material || null,
            variant.weight || null,
            variant.dimensions || null,
            variant.variant_image_url || null,
            variant.is_active !== undefined ? variant.is_active : 1,
          ]
        )
      );
      await Promise.all(variantQueries);
    }

    // Handle attributes
    if (attributes && attributes.length > 0) {
      await connection.execute(
        `DELETE FROM res_product_attribute_relationship WHERE product_id = ?`,
        [product_id]
      );
      const attributeQueries = attributes.map((attribute) =>
        connection.execute(
          `INSERT INTO res_product_attribute_relationship (product_id, attribute_id, value_id)
           VALUES (?, ?, ?)`,
          [product_id, attribute.attribute_id, attribute.value_id]
        )
      );
      await Promise.all(attributeQueries);
    }

    // Handle custom fields
    if (fields && fields.length > 0) {
      await connection.execute(
        `DELETE FROM res_product_fields WHERE product_id = ?`,
        [product_id]
      );
      const fieldQueries = fields.map((field) =>
        connection.execute(
          `INSERT INTO res_product_fields (product_id, field_name, field_type, is_required) VALUES (?, ?, ?, ?)`,
          [product_id, field.field_name, field.field_type, field.is_required]
        )
      );
      await Promise.all(fieldQueries);
    }

    // Handle activation keys if provided
    if (activation_keys && activation_keys.trim() !== '') {
      // Parse activation keys (split by newline, comma, or other delimiters)
      const keys = activation_keys
        .split(/[\n,\r;]+/)
        .map(key => key.trim())
        .filter(key => key.length > 0);
      
      if (keys.length > 0) {
        // Delete existing keys for this product
        await connection.execute(
          `DELETE FROM res_product_activation_keys WHERE product_id = ?`,
          [product_id]
        );
        
        // Note: Inventory will be updated after new keys are inserted below

        // Create a batch for tracking (optional)
        const batchName = `Auto-generated batch ${new Date().toISOString()}`;
        const [batchResult] = await connection.execute(
          `INSERT INTO res_activation_key_batches (product_id, batch_name, total_keys, notes) 
           VALUES (?, ?, ?, ?)`,
          [product_id, batchName, keys.length, 'Auto-generated during product update']
        );

        // Insert each activation key
        for (const key of keys) {
          await connection.execute(
            `INSERT INTO res_product_activation_keys 
             (product_id, activation_key, key_type, description, status) 
             VALUES (?, ?, 'license', NULL, 'available')`,
            [product_id, key]
          );
        }

        // Update product inventory based on activation keys count
        const ProductInventoryService = require('../../services/ProductInventoryService');
        await ProductInventoryService.updateProductInventory(product_id, connection);
      }
    }

    // Update product inventory if it's a digital product (after digital_file_url or activation keys changes)
    if (is_digital_download === 1 || product_type === 'digital') {
      const ProductInventoryService = require('../../services/ProductInventoryService');
      await ProductInventoryService.updateProductInventory(product_id, connection);
    }

    await connection.commit();
    
    // Clear product cache after successful update
    console.log(`🗑️  Clearing product cache for product ID: ${product_id}`);
    try {
      await clearProductCache(product_id);
    } catch (cacheError) {
      console.warn('Cache clear error (non-fatal):', cacheError.message);
    }
    
    res.status(200).json({
      message: "Product updated successfully",
      productId: product_id,
    });
  } catch (error) {
    console.error("Database error:", error);
    await connection.rollback();
    
    // Handle specific database errors
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('sku')) {
        return res.status(409).json({ 
          error: "Product SKU already exists. Please use a different SKU." 
        });
      } else if (error.message.includes('slug')) {
        return res.status(409).json({ 
          error: "Product slug already exists. Please use a different slug." 
        });
      } else {
        return res.status(409).json({ 
          error: "Duplicate entry found. Please check your data." 
        });
      }
    }
    
    if (error.code === 'ER_DATA_TOO_LONG') {
      return res.status(400).json({ 
        error: "One or more fields exceed the maximum allowed length" 
      });
    }
    
    if (error.code === 'ER_BAD_NULL_ERROR') {
      return res.status(400).json({ 
        error: "Required fields cannot be null" 
      });
    }
    
    if (error.code === 'ER_TRUNCATED_WRONG_VALUE') {
      return res.status(400).json({ 
        error: "Invalid data format provided. Please check numeric and date fields." 
      });
    }
    
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ 
        error: "Invalid reference data. Please check category IDs, tag IDs, attribute values, or supplier references." 
      });
    }

    if (error.code === 'ER_PARSE_ERROR' || error.code === 'ER_SYNTAX_ERROR') {
      return res.status(500).json({ 
        error: "Database query error. Please contact support if this issue persists." 
      });
    }
    
    // Generic error for other cases
    res.status(500).json({ 
      error: "Failed to update product. Please try again or contact support if the problem persists." 
    });
  } finally {
    connection.release();
  }
}

async function getProductList(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const categorySlug = req.query.category; // Category slug from query params
    const limit = parseInt(req.query.perPage, 10) || parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status !== undefined ? parseInt(req.query.status, 10) : null;

    // Variable to store resolved category_id
    let categoryId = null;

    if (categorySlug) {
      // Fetch category_id based on the provided slug
      const [categoryResult] = await pool.execute(
        `SELECT category_id FROM res_product_categories WHERE slug = ?`,
        [categorySlug]
      );

      if (categoryResult.length === 0) {
        return res.status(404).json({ 
          error: `Category with slug '${categorySlug}' not found. Please verify the category and try again.` 
        });
      }

      categoryId = categoryResult[0].category_id;
    }

    // Build WHERE conditions dynamically
    const whereConditions = [];
    const queryParams = [];

    // Category filtering
    if (categoryId) {
      whereConditions.push('pcr.category_id = ?');
      queryParams.push(categoryId);
    }

    // Status filtering
    if (status !== null) {
      whereConditions.push('p.status = ?');
      queryParams.push(status);
    }

    // Product type filtering - map numeric codes to string values
    if (req.query.product_type !== undefined) {
      const productTypeNum = parseInt(req.query.product_type, 10);
      // Map numeric codes to string values: 1 = 'digital', 2 = 'physical'
      const productTypeMap = {
        1: 'digital',
        2: 'physical',
        3: 'services'
      };
      const productType = productTypeMap[productTypeNum] || null;
      if (productType) {
      whereConditions.push('p.product_type = ?');
      queryParams.push(productType);
      }
    }

    // Search filtering
    if (search) {
      whereConditions.push(`(
        p.product_name LIKE ? OR 
        p.sku LIKE ? OR 
        p.slug LIKE ? OR 
        p.manufacturer LIKE ? OR 
        p.supplier LIKE ?
      )`);
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // Base query for fetching products
    let baseQuery = `
      SELECT 
        p.product_name, 
        p.product_id,
        p.stock_quantity,
        p.sku,
        p.sale_price,
        p.original_price,
        p.supplier,
        p.manufacturer,
        p.status,
        p.product_type,
        p.slug,
        p.is_digital_download,
        p.requires_activation_key,
        p.digital_file_url,
        p.track_inventory,
        p.created_at,
        p.updated_at
      FROM res_products p
    `;

    // Add JOIN for category filtering if needed
    if (categoryId) {
      baseQuery += `
        JOIN res_product_category_relationship pcr ON p.product_id = pcr.product_id
      `;
    }

    // Add WHERE clause
    if (whereConditions.length > 0) {
      baseQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    baseQuery += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    // Query to fetch basic product details
    const [products] = await pool.execute(baseQuery, queryParams);

    // Get the total count of products with same filtering
    let countQuery = `SELECT COUNT(*) AS total FROM res_products p `;
    if (categoryId) {
      countQuery += `
        JOIN res_product_category_relationship pcr ON p.product_id = pcr.product_id
      `;
    }

    // Add WHERE clause for count query
    if (whereConditions.length > 0) {
      countQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    const countParams = queryParams.slice(0, -2); // Remove limit and offset for count query
    const [[{ total }]] = await pool.execute(countQuery, countParams);

    // Get status counts for products with same filtering as main query
    let statusCountQuery = `SELECT 
      COUNT(CASE WHEN p.status = 2 THEN 1 END) as active_count,
      COUNT(CASE WHEN p.status = 1 THEN 1 END) as draft_count,
      COUNT(CASE WHEN p.status = 3 THEN 1 END) as inactive_count,
      COUNT(CASE WHEN p.status = 4 THEN 1 END) as archived_count,
      COUNT(*) as total_all
    FROM res_products p`;
    
    let statusCountParams = [];
    
    // Add JOIN for category filtering if needed (same as main query)
    if (categoryId) {
      statusCountQuery += `
        JOIN res_product_category_relationship pcr ON p.product_id = pcr.product_id`;
    }
    
    // Build WHERE conditions for status count (same as main query)
    const statusCountWhereConditions = [];
    
    // Category filtering
    if (categoryId) {
      statusCountWhereConditions.push('pcr.category_id = ?');
      statusCountParams.push(categoryId);
    }
    
    // Product type filtering - map numeric codes to string values
    if (req.query.product_type !== undefined) {
      const productTypeNum = parseInt(req.query.product_type, 10);
      // Map numeric codes to string values: 1 = 'digital', 2 = 'physical'
      const productTypeMap = {
        1: 'digital',
        2: 'physical',
        3: 'services'
      };
      const productType = productTypeMap[productTypeNum] || null;
      if (productType) {
      statusCountWhereConditions.push('p.product_type = ?');
      statusCountParams.push(productType);
      }
    }
    
    // Search filtering
    if (search) {
      statusCountWhereConditions.push(`(
        p.product_name LIKE ? OR 
        p.sku LIKE ? OR 
        p.slug LIKE ? OR 
        p.manufacturer LIKE ? OR 
        p.supplier LIKE ?
      )`);
      const searchPattern = `%${search}%`;
      statusCountParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    // Add WHERE clause for status count query
    if (statusCountWhereConditions.length > 0) {
      statusCountQuery += ` WHERE ${statusCountWhereConditions.join(' AND ')}`;
    }
    
    const [[statusCounts]] = await pool.execute(statusCountQuery, statusCountParams);

    // Handle case when no products found
    if (products.length === 0) {
      return res.status(200).json({
        status: "success",
        response: {
          data: [],
          perPage: limit,
          totalCount: total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          statusCounts: {
            active: parseInt(statusCounts.active_count) || 0,
            draft: parseInt(statusCounts.draft_count) || 0,
            inactive: parseInt(statusCounts.inactive_count) || 0,
            archived: parseInt(statusCounts.archived_count) || 0,
            total: parseInt(statusCounts.total_all) || 0
          }
        },
      });
    }

    // Fetch associated media for all products
    const productIds = products.map((p) => p.product_id);

    const [media] = await pool.execute(
      `SELECT 
        media_id, product_id, type, file_name, is_cover, created_at, updated_at
      FROM res_product_media
      WHERE product_id IN (${productIds.join(",")})`
    );

    // Fetch associated categories for all products
    const [categories] = await pool.execute(
      `SELECT 
        c.category_id, c.category_name, pcr.product_id
      FROM res_product_categories c
      JOIN res_product_category_relationship pcr ON c.category_id = pcr.category_id
      WHERE pcr.product_id IN (${productIds.join(",")})`
    );

    const mediaMap = media.reduce((acc, curr) => {
      if (!acc[curr.product_id]) {
        acc[curr.product_id] = [];
      }
      acc[curr.product_id].push(curr);
      return acc;
    }, {});

    const categoriesMap = categories.reduce((acc, curr) => {
      if (!acc[curr.product_id]) {
        acc[curr.product_id] = [];
      }
      acc[curr.product_id].push(curr);
      return acc;
    }, {});

    const productList = products.map((product) => ({
      product_name: product.product_name,
      product_id: product.product_id,
      stock_quantity: product.stock_quantity,
      sku: product.sku,
      status: product.status,
      product_type: product.product_type,
      supplier: product.supplier,
      manufacturer: product.manufacturer,
      media: mediaMap[product.product_id] || [],
      categories: categoriesMap[product.product_id] || [],
      sale_price: product.sale_price,
      original_price: product.original_price,
      slug: product.slug,
      is_digital_download: product.is_digital_download,
      requires_activation_key: product.requires_activation_key,
      digital_file_url: product.digital_file_url,
      track_inventory: product.track_inventory,
      created_at: product.created_at,
      updated_at: product.updated_at,
    }));

    const result = {
      data: productList,
      perPage: limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      statusCounts: {
        active: parseInt(statusCounts.active_count) || 0,
        draft: parseInt(statusCounts.draft_count) || 0,
        inactive: parseInt(statusCounts.inactive_count) || 0,
        archived: parseInt(statusCounts.archived_count) || 0,
        total: parseInt(statusCounts.total_all) || 0
      }
    };

    return res.status(200).json({
      status: "success",
      response: result,
    });
  } catch (error) {
    console.error("Error fetching product list:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getRelatedProducts(req, res) {
  try {
    const { slug } = req.params; // Assuming the product slug is passed as a route parameter

    // Validate slug
    if (!slug) {
      return res.status(400).json({ 
        error: "Product slug is required" 
      });
    }

    // Fetch the product_id associated with the provided slug
    const [productResult] = await pool.execute(
      `SELECT product_id 
       FROM res_products 
       WHERE slug = ?`,
      [slug]
    );

    if (productResult.length === 0) {
      return res.status(404).json({ 
        error: `Product with slug '${slug}' not found. Please verify the product slug and try again.` 
      });
    }

    const productId = productResult[0].product_id;

    // Fetch categories associated with the resolved product_id
    const [categories] = await pool.execute(
      `SELECT category_id 
       FROM res_product_category_relationship 
       WHERE product_id = ?`,
      [productId]
    );

    if (categories.length === 0) {
      return res.status(404).json({ error: "No categories found for the product" });
    }

    const categoryIds = categories.map((cat) => cat.category_id);

    // Fetch related products in the same categories, excluding the current product
    const [relatedProducts] = await pool.execute(
      `SELECT DISTINCT 
        p.product_name, 
        p.slug, 
        p.sale_price, 
        p.original_price, 
        p.rating, 
        p.reviews_count, 
        p.product_id 
      FROM res_products p
      JOIN res_product_category_relationship pcr ON p.product_id = pcr.product_id
      WHERE pcr.category_id IN (${categoryIds.join(",")}) AND p.product_id != ?
      LIMIT 5`, // Limit the number of related products to 5
      [productId]
    );

    // If no related products are found, return an empty array
    if (relatedProducts.length === 0) {
      return res.status(200).json({
        status: "success",
        related_products: [],
      });
    }

    // Fetch the cover image for the related products
    const relatedProductIds = relatedProducts.map((p) => p.product_id);

    const [media] = await pool.execute(
      `SELECT 
        product_id, file_name
      FROM res_product_media 
      WHERE is_cover = 1 AND product_id IN (${relatedProductIds.join(",")})`
    );

    // Map media to products
    const mediaMap = media.reduce((acc, curr) => {
      acc[curr.product_id] = curr.file_name;
      return acc;
    }, {});

    // Construct the response
    const result = relatedProducts.map((product) => ({
      product_name: product.product_name,
      slug: product.slug,
      image: mediaMap[product.product_id] || null,
      sale_price: product.sale_price,
      original_price: product.original_price,
      rating: product.rating,
      reviews_count: product.reviews_count,
    }));

    return res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    console.error("Error fetching related products:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getProductsByCategory(req, res) {
  try {
    const { slug } = req.params; // Get category slug from route parameter

    // Validate slug
    if (!slug) {
      return res.status(400).json({ 
        error: "Category slug is required" 
      });
    }

    // Fetch category ID associated with the slug
    const [categoryResult] = await pool.execute(
      `SELECT category_id FROM res_product_categories WHERE slug = ?`,
      [slug]
    );

    if (categoryResult.length === 0) {
      return res.status(404).json({ 
        error: `Category with slug '${slug}' not found. Please verify the category and try again.` 
      });
    }

    const categoryId = categoryResult[0].category_id;

    // Fetch products associated with the category ID, limited to 5 products and ordered by date desc
    const [products] = await pool.execute(
      `SELECT p.product_name, p.slug, p.sale_price, p.original_price, p.rating, p.reviews_count, p.product_id 
       FROM res_products p
       JOIN res_product_category_relationship pcr ON p.product_id = pcr.product_id
       WHERE pcr.category_id = ?
       ORDER BY p.created_at DESC
       LIMIT 5`,
      [categoryId]
    );

    // If no products are found, return an empty array
    if (products.length === 0) {
      return res.status(200).json({
        status: "success",
        data: [],
      });
    }

    // Fetch the cover image for the products
    const productIds = products.map((p) => p.product_id);

    const [media] = await pool.execute(
      `SELECT 
        product_id, file_name
       FROM res_product_media 
       WHERE is_cover = 1 AND product_id IN (${productIds.join(",")})`
    );

    // Map media to products
    const mediaMap = media.reduce((acc, curr) => {
      acc[curr.product_id] = curr.file_name;
      return acc;
    }, {});

    // Construct the response
    const result = products.map((product) => ({
      product_name: product.product_name,
      slug: product.slug,
      image: mediaMap[product.product_id] || null,
      sale_price: product.sale_price,
      original_price: product.original_price,
      rating: product.rating,
      reviews_count: product.reviews_count,
    }));

    return res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    console.error("Error fetching products by category slug:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}


async function getProductDetails(req, res) {
  const slug = req.params.slug;

  if (!slug) {
    return res.status(400).json({ 
      error: "Product slug is required" 
    });
  }

  const connection = await pool.getConnection();

  try {
    // Start transaction
    await connection.beginTransaction();

    // Fetch product details by slug
    const [productRows] = await connection.execute(
      `SELECT 
        p.product_id, 
        p.product_name, 
        p.sku, 
        p.slug, 
        p.original_price, 
        p.sale_price, 
        p.stock_quantity,
        p.short_description, 
        p.description, 
        p.manufacturer, 
        p.supplier, 
        p.status, 
        p.is_featured, 
        p.rating, 
        p.reviews_count
      FROM res_products p
      WHERE p.slug = ?`,
      [slug]
    );

    if (productRows.length === 0) {
      return res.status(404).json({ 
        error: `Product with slug '${slug}' not found. Please verify the product slug and try again.` 
      });
    }

    const product = productRows[0];
    const productId = product.product_id;

    // Fetch associated media
    const [mediaRows] = await connection.execute(
      `SELECT 
        media_id, 
        type, 
        file_name, 
        is_cover
      FROM res_product_media
      WHERE product_id = ?`,
      [productId]
    );

    // Fetch categories
    const [categoryRows] = await connection.execute(
      `SELECT 
        c.category_id, 
        c.category_name
      FROM res_product_category_relationship r
      JOIN res_product_categories c ON r.category_id = c.category_id
      WHERE r.product_id = ?`,
      [productId]
    );

    // Fetch tags
    const [tagRows] = await connection.execute(
      `SELECT 
        t.tag_id, 
        t.tag_name
      FROM res_product_tag_relationship r
      JOIN res_product_tags t ON r.tag_id = t.tag_id
      WHERE r.product_id = ?`,
      [productId]
    );

    // Fetch variants
    const [variantRows] = await connection.execute(
      `SELECT 
        variant_id, 
        variant_sku, 
        variant_name, 
        variant_price, 
        variant_stock_quantity, 
        color, 
        size, 
        material, 
        weight, 
        dimensions, 
        variant_image_url,
        is_active
      FROM res_product_variants
      WHERE product_id = ?`,
      [productId]
    );

    // Fetch attributes
    const [attributeRows] = await connection.execute(
      `SELECT 
        ar.product_id, 
        a.name, 
        a.slug,
        v.name AS value
      FROM res_product_attribute_relationship ar
      JOIN res_product_attributes a ON ar.id = a.id
      JOIN res_product_attribute_values v ON ar.value_id = v.id
      WHERE ar.product_id = ?`,
      [productId]
    );

    // Fetch custom fields
    const [fieldRows] = await connection.execute(
      `SELECT 
        field_id, 
        field_name, 
        field_type, 
        is_required
      FROM res_product_fields
      WHERE product_id = ?`,
      [productId]
    );

    // Commit transaction
    await connection.commit();

    // Build the response object
    const productDetails = {
      ...product,
      media: mediaRows,
      categories: categoryRows,
      tags: tagRows,
      variants: variantRows,
      attributes: attributeRows,
      fields: fieldRows,
    };

    res.status(200).json({
      message: "Product details fetched successfully",
      data: productDetails,
    });
  } catch (error) {
    console.error("Database error:", error);

    // Rollback transaction if any error occurs
    await connection.rollback();

    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    // Release the connection
    connection.release();
  }
}

async function getProductDetailsById(req, res) {
  const productId = req.params.id;

  if (!productId) {
    return res.status(400).json({ 
      error: "Product ID is required" 
    });
  }

  if (isNaN(parseInt(productId, 10)) || parseInt(productId, 10) <= 0) {
    return res.status(400).json({ 
      error: "Invalid product ID. Product ID must be a valid positive number." 
    });
  }

  const connection = await pool.getConnection();

  try {
    // Start transaction
    await connection.beginTransaction();
    console.log("Product ID:", productId);

    // Fetch product details by ID - ALL fields
    const [product] = await connection.execute(
      `SELECT 
        p.*
      FROM res_products p
      WHERE p.product_id = ?`,
      [productId]
    );

    if (product.length === 0) {
      return res.status(404).json({ 
        error: `Product with ID ${productId} not found. Please verify the product ID and try again.` 
      });
    }

    // Fetch associated media
    const [mediaRows] = await connection.execute(
      `SELECT 
        media_id, 
        type, 
        file_name, 
        is_cover
      FROM res_product_media
      WHERE product_id = ?`,
      [productId]
    );

    // Fetch categories
    const [categoryRows] = await connection.execute(
      `SELECT 
        c.category_id, 
        c.category_name
      FROM res_product_category_relationship r
      JOIN res_product_categories c ON r.category_id = c.category_id
      WHERE r.product_id = ?`,
      [productId]
    );

    // Fetch tags
    const [tagRows] = await connection.execute(
      `SELECT 
        t.tag_id, 
        t.tag_name
      FROM res_product_tag_relationship r
      JOIN res_product_tags t ON r.tag_id = t.tag_id
      WHERE r.product_id = ?`,
      [productId]
    );

    // Fetch variants
    const [variantRows] = await connection.execute(
      `SELECT 
        variant_id, 
        variant_sku, 
        variant_name, 
        variant_price, 
        variant_stock_quantity, 
        color, 
        size, 
        material, 
        weight, 
        dimensions, 
        variant_image_url,
        is_active
      FROM res_product_variants
      WHERE product_id = ?`,
      [productId]
    );

    // Fetch attributes
    const [attributeRows] = await connection.execute(
      `SELECT 
        ar.product_id, 
        a.name, 
        a.slug,
        v.name AS value
      FROM res_product_attribute_relationship ar
      JOIN res_product_attributes a ON ar.id = a.id
      JOIN res_product_attribute_values v ON ar.value_id = v.id
      WHERE ar.product_id = ?`,
      [productId]
    );

    // Fetch custom fields
    const [fieldRows] = await connection.execute(
      `SELECT 
        field_id, 
        field_name, 
        field_type, 
        is_required
      FROM res_product_fields
      WHERE product_id = ?`,
      [productId]
    );

    // Fetch supplier details if supplier exists
    let supplierDetails = null;
    if (product[0].supplier) {
      const [supplierRows] = await connection.execute(
        `SELECT 
          supplier_id,
          supplier_name,
          contact_person,
          email,
          phone,
          mobile,
          website,
          address,
          city,
          state,
          country,
          postal_code,
          tax_id,
          gst_number,
          credit_limit,
          payment_terms_days,
          notes,
          status,
          created_at,
          updated_at
        FROM res_suppliers
        WHERE supplier_name = ?`,
        [product[0].supplier]
      );
      
      if (supplierRows.length > 0) {
        supplierDetails = supplierRows[0];
      }
    }

    // Fetch activation keys - only available keys
    const [activationKeysRows] = await connection.execute(
      `SELECT 
        key_id,
        activation_key,
        key_type,
        status,
        created_at
      FROM res_product_activation_keys
      WHERE product_id = ? AND status = 'available'
      ORDER BY created_at DESC`,
      [productId]
    );

    // Convert activation keys array to string format for form field
    const activationKeysString = activationKeysRows.map(key => key.activation_key).join('\n');

    // Commit transaction
    await connection.commit();

    // Build the response object
    const productDetails = {
      ...product[0],
      media: mediaRows,
      categories: categoryRows,
      tags: tagRows,
      variants: variantRows,
      attributes: attributeRows,
      fields: fieldRows,
      supplier: supplierDetails,
      activation_keys: activationKeysString, // String format for form field
      activation_keys_list: activationKeysRows, // Array format with full details
    };

    res.status(200).json({
      message: "Product details fetched successfully",
      data: productDetails,
    });
  } catch (error) {
    console.error("Database error:", error);

    // Rollback transaction if any error occurs
    await connection.rollback();

    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    // Release the connection
    connection.release();
  }
}

async function deleteProduct(req, res) {
  const { productId } = req.params;
  const product_id = parseInt(productId, 10);

  if (!productId) {
    return res.status(400).json({ 
      error: "Product ID is required" 
    });
  }

  if (isNaN(product_id) || product_id <= 0) {
    return res.status(400).json({ 
      error: "Invalid product ID. Product ID must be a valid positive number." 
    });
  }

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    // Check if product exists
    const [existingProduct] = await connection.execute(
      `SELECT product_id FROM res_products WHERE product_id = ?`,
      [product_id]
    );

    if (existingProduct.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        error: `Product with ID ${product_id} not found. Please verify the product ID and try again.` 
      });
    }

    // Delete the product
    await connection.execute(`DELETE FROM res_products WHERE product_id = ?`, [
      product_id,
    ]);

    // Delete associated media
    await connection.execute(
      `DELETE FROM res_product_media WHERE product_id = ?`,
      [product_id]
    );

    // Delete associated categories
    await connection.execute(
      `DELETE FROM res_product_category_relationship WHERE product_id = ?`,
      [product_id]
    );

    // Delete associated tags
    await connection.execute(
      `DELETE FROM res_product_tag_relationship WHERE product_id = ?`,
      [product_id]
    );

    // Delete associated variants
    await connection.execute(
      `DELETE FROM res_product_variants WHERE product_id = ?`,
      [product_id]
    );

    // Delete associated attributes
    await connection.execute(
      `DELETE FROM res_product_attribute_relationship WHERE product_id = ?`,
      [product_id]
    );

    // Delete associated fields
    await connection.execute(
      `DELETE FROM res_product_fields WHERE product_id = ?`,
      [product_id]
    );

    await connection.commit();
    
    // Clear product cache after successful deletion
    await clearProductCache(product_id);
    
    res.status(200).json({
      message: "Product deleted successfully",
      productId: product_id,
    });
  } catch (error) {
    console.error("Database error:", error);
    await connection.rollback();
    
    // Handle specific database errors
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(409).json({ 
        error: "Cannot delete product. This product has associated orders, invoices, or other references. Please remove all references before deleting." 
      });
    }
    
    if (error.code === 'ER_FOREIGN_KEY_CONSTRAINT') {
      return res.status(409).json({ 
        error: "Cannot delete product due to foreign key constraints. Please remove all related data first." 
      });
    }
    
    // Generic error for other cases
    res.status(500).json({ 
      error: "Failed to delete product. Please try again or contact support if the problem persists." 
    });
  } finally {
    connection.release();
  }
}

module.exports = {
  addProduct,
  getProductList,
  updateProduct,
  getProductDetails,
  deleteProduct,
  getProductDetailsById,
  getRelatedProducts,
  getProductsByCategory,
};
