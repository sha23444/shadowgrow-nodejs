const { pool } = require("../../config/database");

async function getProductList(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const categorySlug = req.query.category || null;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const minPrice = parseFloat(req.query.minPrice) || null;
    const maxPrice = parseFloat(req.query.maxPrice) || null;
    
    // Sorting parameters
    const sortBy = req.query.sortBy || 'created_at'; // Default to latest
    const sortOrder = req.query.sortOrder || 'desc'; // Default to descending

    // Generate cache key based on query parameters including sorting and price filters
    const cacheKey = `products:list:${categorySlug || 'all'}:${page}:${limit}:${sortBy}:${sortOrder}:${minPrice || 'all'}:${maxPrice || 'all'}`;
    
    // Check if Redis cache is available and try to get cached data
    if (req.cache) {
      const cachedData = await req.cache.get(cacheKey);
      if (cachedData) {
        return res.status(200).json({
          status: "success",
          response: cachedData,
          cached: true
        });
      }
    }

    // Fetch from database if not cached
    const products = await fetchProductListFromDatabase(categorySlug, limit, offset, page, sortBy, sortOrder, minPrice, maxPrice);

    // Cache the result if Redis is available (cache for 5 minutes)
    if (req.cache) {
      await req.cache.set(cacheKey, products, 300);
    }

    return res.status(200).json({
      status: "success",
      response: products,
      cached: false
    });
  } catch (error) {
    console.error("Error fetching product list:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// New function for digital and physical products only (no services)
async function getProductListDigitalPhysical(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const categorySlug = req.query.category || null;
    const limit = parseInt(req.query.limit, 10) || 12;
    const offset = (page - 1) * limit;
    const minPrice = parseFloat(req.query.minPrice) || null;
    const maxPrice = parseFloat(req.query.maxPrice) || null;
    const productType = req.query.product_type || null; // Support filtering by product_type
    
    // Sorting parameters
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder || 'desc';

    // Generate cache key
    const cacheKey = `products:digital-physical:${categorySlug || 'all'}:${productType || 'all'}:${page}:${limit}:${sortBy}:${sortOrder}:${minPrice || 'all'}:${maxPrice || 'all'}`;
    
    // Check cache
    const { get, set } = require("../../config/smart-cache");
    const cached = await get(cacheKey);
    
    if (cached) {
      return res.status(200).json({
        status: "success",
        response: cached,
        cached: true
      });
    }

    // Fetch from database
    const products = await fetchDigitalPhysicalProducts(categorySlug, limit, offset, page, sortBy, sortOrder, minPrice, maxPrice, productType);

    // Cache the result for 1 hour
    await set(cacheKey, products, 3600);

    return res.status(200).json({
      status: "success",
      response: products,
      cached: false
    });
  } catch (error) {
    console.error("Error fetching product list:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * Builds ORDER BY clause based on sortBy and sortOrder parameters
 */
function buildOrderByClause(sortBy, sortOrder) {
  // Validate sortOrder
  const validSortOrders = ['asc', 'desc'];
  const order = validSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toUpperCase() : 'DESC';
  
  // Define valid sort fields and their corresponding database columns
  const sortFields = {
    'price': 'p.sale_price', // Use sale_price as primary price
    'original_price': 'p.original_price',
    'sale_price': 'p.sale_price',
    'name': 'p.product_name',
    'product_name': 'p.product_name',
    'date': 'p.created_at',
    'created_at': 'p.created_at',
    'updated_at': 'p.updated_at',
    'rating': 'p.rating',
    'reviews': 'p.reviews_count',
    'reviews_count': 'p.reviews_count',
    'stock': 'p.stock_quantity',
    'stock_quantity': 'p.stock_quantity',
    'sku': 'p.sku',
    'manufacturer': 'p.manufacturer',
    'supplier': 'p.supplier',
    'status': 'p.status',
    'featured': 'p.is_featured',
    'is_featured': 'p.is_featured'
  };
  
  // Get the database column for sorting, default to created_at
  const sortColumn = sortFields[sortBy.toLowerCase()] || 'p.created_at';
  
  return `ORDER BY ${sortColumn} ${order}`;
}

/**
 * Fetches product data from the database with optional category filtering.
 */

async function fetchProductListFromDatabase(
  categorySlug,
  limit,
  offset,
  page,
  sortBy = 'created_at',
  sortOrder = 'desc',
  minPrice = null,
  maxPrice = null
) {
  try {
    let categoryId = null;

    // Resolve category_id if categorySlug is provided
    if (categorySlug) {
      const [categoryResult] = await pool.execute(
        `SELECT category_id FROM res_product_categories WHERE slug = ?`,
        [categorySlug]
      );

      if (categoryResult.length === 0) {
        throw new Error("Invalid category");
      }

      categoryId = categoryResult[0].category_id;
    }

    // Prepare base query
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
        p.slug,
        p.created_at
      FROM res_products p
    `;
    const queryParams = [];
    const whereConditions = [];

    if (categoryId) {
      baseQuery += `
        JOIN res_product_category_relationship pcr ON p.product_id = pcr.product_id
      `;
      whereConditions.push(`pcr.category_id = ?`);
      queryParams.push(categoryId);
    }

    // Add price filtering
    if (minPrice !== null) {
      whereConditions.push(`p.sale_price >= ?`);
      queryParams.push(minPrice);
    }

    if (maxPrice !== null) {
      whereConditions.push(`p.sale_price <= ?`);
      queryParams.push(maxPrice);
    }

    // Add WHERE clause if we have conditions
    if (whereConditions.length > 0) {
      baseQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    // Add pagination parameters
    queryParams.push(limit, offset);

    // Build ORDER BY clause based on sortBy parameter
    const orderByClause = buildOrderByClause(sortBy, sortOrder);
    baseQuery += ` ${orderByClause} LIMIT ? OFFSET ?`;

    // Fetch product list
    const [products] = await pool.execute(baseQuery, queryParams);
    if (products.length === 0) {
      return {
        currentPage: page,
        totalPages: 1,
        totalCount: 0,
        data: [],
      };
    }

    // Fetch total product count with same conditions
    let countQuery = `
      SELECT COUNT(*) AS total 
      FROM res_products p
    `;
    const countParams = [];

    if (categoryId) {
      countQuery += `
        JOIN res_product_category_relationship pcr ON p.product_id = pcr.product_id
      `;
    }

    const countWhereConditions = [];
    if (categoryId) {
      countWhereConditions.push(`pcr.category_id = ?`);
      countParams.push(categoryId);
    }

    // Add price filtering to count query
    if (minPrice !== null) {
      countWhereConditions.push(`p.sale_price >= ?`);
      countParams.push(minPrice);
    }

    if (maxPrice !== null) {
      countWhereConditions.push(`p.sale_price <= ?`);
      countParams.push(maxPrice);
    }

    if (countWhereConditions.length > 0) {
      countQuery += ` WHERE ${countWhereConditions.join(' AND ')}`;
    }

    const [[{ total }]] = await pool.execute(countQuery, countParams);

    // Fetch media and categories for the products
    const productIds = products.map((product) => product.product_id);
    const [media] = await pool.execute(
      `SELECT media_id, product_id, type, file_name, is_cover, created_at, updated_at 
       FROM res_product_media WHERE product_id IN (${productIds
         .map(() => "?")
         .join(",")})`,
      productIds
    );
    const [categories] = await pool.execute(
      `SELECT c.category_id, c.category_name, pcr.product_id 
       FROM res_product_categories c 
       JOIN res_product_category_relationship pcr ON c.category_id = pcr.category_id 
       WHERE pcr.product_id IN (${productIds.map(() => "?").join(",")})`,
      productIds
    );

    // Map media and categories
    const mediaMap = media.reduce((acc, item) => {
      if (!acc[item.product_id]) acc[item.product_id] = [];
      acc[item.product_id].push(item);
      return acc;
    }, {});
    const categoriesMap = categories.reduce((acc, item) => {
      if (!acc[item.product_id]) acc[item.product_id] = [];
      acc[item.product_id].push(item);
      return acc;
    }, {});

    // Format the product list
    const productList = products.map((product) => ({
      ...product,
      media: mediaMap[product.product_id] || [],
      categories: categoriesMap[product.product_id] || [],
    }));

    return {
      data: productList,
      perPage: limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    };
  } catch (error) {
    console.error("Error fetching data from the database:", error);
    throw error;
  }
}

async function getRelatedProducts(req, res) {
  try {
    const { slug } = req.params;

    // Validate slug
    if (!slug) {
      return res.status(400).json({ error: "Product slug is required" });
    }

    // Generate cache key for related products
    const cacheKey = `related:products:${slug}`;
    
    // Check if Redis cache is available and try to get cached data
    if (req.cache) {
      const cachedData = await req.cache.get(cacheKey);
      if (cachedData) {
        return res.status(200).json({
          message: "Related products fetched successfully",
          data: cachedData,
          cached: true
        });
      }
    }

    // Get the current product ID
    const [productResult] = await pool.execute(
      `SELECT product_id FROM res_products WHERE slug = ? AND status = 2`,
      [slug]
    );

    if (productResult.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const productId = productResult[0].product_id;

    // Fetch categories associated with the current product
    const [categories] = await pool.execute(
      `SELECT category_id 
       FROM res_product_category_relationship 
       WHERE product_id = ?`,
      [productId]
    );

    if (categories.length === 0) {
      return res.status(200).json({
        message: "Related products fetched successfully",
        data: [],
        cached: false
      });
    }

    const categoryIds = categories.map((cat) => cat.category_id);

    // Fetch related products in the same categories, excluding the current product
    // Only show active products with proper ordering
    const [relatedProducts] = await pool.execute(
      `SELECT DISTINCT 
          p.product_id,
          p.product_name, 
          p.slug, 
          p.sale_price, 
          p.original_price, 
          p.rating, 
          p.reviews_count,
          p.is_featured,
          p.created_at
        FROM res_products p
        JOIN res_product_category_relationship pcr ON p.product_id = pcr.product_id
        WHERE pcr.category_id IN (${categoryIds.map(() => '?').join(',')}) 
          AND p.product_id != ? 
          AND p.status = 2
        ORDER BY p.is_featured DESC, p.rating DESC, p.created_at DESC
        LIMIT 4`,
      [...categoryIds, productId]
    );

    // If no related products found, try to get any active products as fallback
    if (relatedProducts.length === 0) {
      const [fallbackProducts] = await pool.execute(
        `SELECT 
            p.product_id,
            p.product_name, 
            p.slug, 
            p.sale_price, 
            p.original_price, 
            p.rating, 
            p.reviews_count,
            p.is_featured,
            p.created_at
          FROM res_products p
          WHERE p.product_id != ? 
            AND p.status = 2
          ORDER BY p.is_featured DESC, p.rating DESC, p.created_at DESC
          LIMIT 4`,
        [productId]
      );

      if (fallbackProducts.length === 0) {
        return res.status(200).json({
          message: "Related products fetched successfully",
          data: [],
          cached: false
        });
      }

      // Process fallback products
      const fallbackProductIds = fallbackProducts.map((p) => p.product_id);
      const [fallbackMedia] = await pool.execute(
        `SELECT product_id, file_name, type
         FROM res_product_media 
         WHERE product_id IN (${fallbackProductIds.map(() => '?').join(',')})
         ORDER BY is_cover DESC, created_at ASC`,
        fallbackProductIds
      );

      const fallbackMediaMap = {};
      fallbackMedia.forEach(media => {
        if (!fallbackMediaMap[media.product_id]) {
          fallbackMediaMap[media.product_id] = media.file_name;
        }
      });

      const fallbackResult = fallbackProducts.map((product) => ({
        product_id: product.product_id,
        product_name: product.product_name,
        slug: product.slug,
        image: fallbackMediaMap[product.product_id] || null,
        sale_price: product.sale_price,
        original_price: product.original_price,
        rating: product.rating,
        reviews_count: product.reviews_count,
        is_featured: product.is_featured,
        created_at: product.created_at
      }));

      // Cache the result if Redis is available (cache for 10 minutes)
      if (req.cache) {
        await req.cache.set(cacheKey, fallbackResult, 600);
      }

      return res.status(200).json({
        message: "Related products fetched successfully",
        data: fallbackResult,
        cached: false
      });
    }

    // Fetch media for related products
    const relatedProductIds = relatedProducts.map((p) => p.product_id);
    const [media] = await pool.execute(
      `SELECT product_id, file_name, type
       FROM res_product_media 
       WHERE product_id IN (${relatedProductIds.map(() => '?').join(',')})
       ORDER BY is_cover DESC, created_at ASC`,
      relatedProductIds
    );

    // Map media to products (prioritize cover images)
    const mediaMap = {};
    media.forEach(mediaItem => {
      if (!mediaMap[mediaItem.product_id]) {
        mediaMap[mediaItem.product_id] = mediaItem.file_name;
      }
    });

    // Construct the response
    const result = relatedProducts.map((product) => ({
      product_id: product.product_id,
      product_name: product.product_name,
      slug: product.slug,
      image: mediaMap[product.product_id] || null,
      sale_price: product.sale_price,
      original_price: product.original_price,
      rating: product.rating,
      reviews_count: product.reviews_count,
      is_featured: product.is_featured,
      created_at: product.created_at
    }));

    // Cache the result if Redis is available (cache for 10 minutes)
    if (req.cache) {
      await req.cache.set(cacheKey, result, 600);
    }

    return res.status(200).json({
      message: "Related products fetched successfully",
      data: result,
      cached: false
    });
  } catch (error) {
    console.error("Error fetching related products:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getProductsByCategory(req, res) {
  try {
    const { slug } = req.params; // Get category slug from route parameter
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const offset = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder || 'desc';
    const minPrice = parseFloat(req.query.minPrice) || null;
    const maxPrice = parseFloat(req.query.maxPrice) || null;

    // Validate slug
    if (!slug) {
      return res.status(400).json({ 
        status: "error",
        message: "Category slug is required" 
      });
    }

    // Generate cache key
    const cacheKey = `products:category:${slug}:${page}:${limit}:${sortBy}:${sortOrder}:${minPrice || 'all'}:${maxPrice || 'all'}`;
    
    // Check if Redis cache is available
    if (req.cache) {
      const cachedData = await req.cache.get(cacheKey);
      if (cachedData) {
        return res.status(200).json({
          status: "success",
          message: "Products by category retrieved successfully",
          response: cachedData,
          cached: true
        });
      }
    }

    // Fetch category information
    const [categoryResult] = await pool.execute(
      `SELECT category_id, category_name, slug, image FROM res_product_categories WHERE slug = ?`,
      [slug]
    );

    if (categoryResult.length === 0) {
      return res.status(404).json({ 
        status: "error",
        message: "Category not found" 
      });
    }

    const category = categoryResult[0];
    const categoryId = category.category_id;

    // Build ORDER BY clause
    const orderByClause = buildOrderByClause(sortBy, sortOrder);

    // Build WHERE conditions for price filtering
    const whereConditions = ['pcr.category_id = ?', 'p.status = 2'];
    const queryParams = [categoryId];

    if (minPrice !== null) {
      whereConditions.push('p.sale_price >= ?');
      queryParams.push(minPrice);
    }

    if (maxPrice !== null) {
      whereConditions.push('p.sale_price <= ?');
      queryParams.push(maxPrice);
    }

    queryParams.push(limit, offset);

    // Fetch products with comprehensive data
    const [products] = await pool.execute(
      `SELECT 
        p.product_id,
        p.product_name, 
        p.slug,
        p.sku,
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
        p.reviews_count,
        p.created_at
      FROM res_products p
      JOIN res_product_category_relationship pcr ON p.product_id = pcr.product_id
      WHERE ${whereConditions.join(' AND ')}
      ${orderByClause}
      LIMIT ? OFFSET ?`,
      queryParams
    );

    // If no products are found, return empty result
    if (products.length === 0) {
      const emptyResponse = {
        category: {
          category_id: category.category_id,
          category_name: category.category_name,
          slug: category.slug,
          image: category.image
        },
        data: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: limit,
          hasNextPage: false,
          hasPrevPage: false
        },
        summary: {
          totalProducts: 0,
          averagePrice: 0,
          priceRange: { min: 0, max: 0 }
        }
      };

      // Cache empty result for 5 minutes
      if (req.cache) {
        await req.cache.set(cacheKey, emptyResponse, 300);
      }

      return res.status(200).json({
        status: "success",
        message: "No products found in this category",
        response: emptyResponse,
        cached: false
      });
    }

    // Get total count for pagination
    const countWhereConditions = ['pcr.category_id = ?', 'p.status = 2'];
    const countParams = [categoryId];

    if (minPrice !== null) {
      countWhereConditions.push('p.sale_price >= ?');
      countParams.push(minPrice);
    }

    if (maxPrice !== null) {
      countWhereConditions.push('p.sale_price <= ?');
      countParams.push(maxPrice);
    }

    const [countResult] = await pool.execute(
      `SELECT COUNT(*) AS total 
       FROM res_products p
       JOIN res_product_category_relationship pcr ON p.product_id = pcr.product_id
       WHERE ${countWhereConditions.join(' AND ')}`,
      countParams
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Fetch media for all products
    const productIds = products.map(p => p.product_id);
    const [mediaRows] = await pool.execute(
      `SELECT 
        product_id, 
        type, 
        file_name, 
        is_cover
      FROM res_product_media 
      WHERE product_id IN (${productIds.join(',')}) 
      ORDER BY is_cover DESC, media_id ASC`
    );

    // Group media by product
    const mediaMap = {};
    mediaRows.forEach(media => {
      if (!mediaMap[media.product_id]) {
        mediaMap[media.product_id] = [];
      }
      mediaMap[media.product_id].push({
        type: media.type,
        file_name: media.file_name,
        is_cover: media.is_cover
      });
    });

    // Fetch categories for each product
    const [categoryRows] = await pool.execute(
      `SELECT 
        pcr.product_id,
        c.category_id,
        c.category_name,
        c.slug
      FROM res_product_category_relationship pcr
      JOIN res_product_categories c ON pcr.category_id = c.category_id
      WHERE pcr.product_id IN (${productIds.join(',')})`
    );

    // Group categories by product
    const categoryMap = {};
    categoryRows.forEach(cat => {
      if (!categoryMap[cat.product_id]) {
        categoryMap[cat.product_id] = [];
      }
      categoryMap[cat.product_id].push({
        category_id: cat.category_id,
        category_name: cat.category_name,
        slug: cat.slug
      });
    });

    // Fetch tags for each product
    const [tagRows] = await pool.execute(
      `SELECT 
        ptr.product_id,
        t.tag_id,
        t.tag_name,
        t.slug
      FROM res_product_tag_relationship ptr
      JOIN res_product_tags t ON ptr.tag_id = t.tag_id
      WHERE ptr.product_id IN (${productIds.join(',')})`
    );

    // Group tags by product
    const tagMap = {};
    tagRows.forEach(tag => {
      if (!tagMap[tag.product_id]) {
        tagMap[tag.product_id] = [];
      }
      tagMap[tag.product_id].push({
        tag_id: tag.tag_id,
        tag_name: tag.tag_name,
        slug: tag.slug
      });
    });

    // Format products with all data
    const formattedProducts = products.map(product => {
      const coverImage = mediaMap[product.product_id]?.find(m => m.is_cover);
      const allImages = mediaMap[product.product_id] || [];
      
      return {
        product_id: product.product_id,
        product_name: product.product_name,
        slug: product.slug,
        sku: product.sku,
        original_price: product.original_price,
        sale_price: product.sale_price,
        stock_quantity: product.stock_quantity,
        short_description: product.short_description,
        description: product.description,
        manufacturer: product.manufacturer,
        supplier: product.supplier,
        is_featured: product.is_featured,
        rating: product.rating,
        reviews_count: product.reviews_count,
        created_at: product.created_at,
        media: {
          cover_image: coverImage ? coverImage.file_name : null,
          images: allImages.map(img => ({
            type: img.type,
            file_name: img.file_name,
            is_cover: img.is_cover
          }))
        },
        categories: categoryMap[product.product_id] || [],
        tags: tagMap[product.product_id] || []
      };
    });

    // Calculate summary statistics
    const prices = products.filter(p => p.sale_price).map(p => parseFloat(p.sale_price));
    const averagePrice = prices.length > 0 ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0;
    const priceRange = prices.length > 0 ? {
      min: Math.min(...prices),
      max: Math.max(...prices)
    } : { min: 0, max: 0 };

    const response = {
      category: {
        category_id: category.category_id,
        category_name: category.category_name,
        slug: category.slug,
        image: category.image
      },
      data: formattedProducts,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      summary: {
        totalProducts: total,
        averagePrice: parseFloat(averagePrice.toFixed(2)),
        priceRange: {
          min: parseFloat(priceRange.min.toFixed(2)),
          max: parseFloat(priceRange.max.toFixed(2))
        }
      }
    };

    // Cache the result for 10 minutes
    if (req.cache) {
      await req.cache.set(cacheKey, response, 600);
    }

    res.status(200).json({
      status: "success",
      message: "Products by category retrieved successfully",
      response: response,
      cached: false
    });

  } catch (error) {
    console.error("Error fetching products by category:", error);
    res.status(500).json({ 
      status: "error",
      message: "Internal Server Error",
      error: error.message 
    });
  }
}

/**
 * Calculate dynamic price ranges based on actual data distribution
 */
function calculateDynamicRanges(prices, minPrice, maxPrice) {
  const totalProducts = prices.length;
  
  // Sort prices for percentile calculations
  const sortedPrices = [...prices].sort((a, b) => a - b);
  
  // Calculate percentiles for better distribution
  const p25 = sortedPrices[Math.floor(totalProducts * 0.25)];
  const p50 = sortedPrices[Math.floor(totalProducts * 0.50)];
  const p75 = sortedPrices[Math.floor(totalProducts * 0.75)];
  
  // Create ranges based on quartiles and data distribution
  const ranges = [];
  
  // Always start with "Under" range if minPrice > 0
  if (minPrice > 0) {
    const underThreshold = Math.min(p25, minPrice * 2);
    ranges.push({
      min: 0,
      max: underThreshold,
      label: `Under ${Math.round(underThreshold)}`,
      count: 0
    });
  }
  
  // Create ranges based on quartiles
  const quartileRanges = [
    { min: minPrice, max: p25, label: `${Math.round(minPrice)} - ${Math.round(p25)}` },
    { min: p25, max: p50, label: `${Math.round(p25)} - ${Math.round(p50)}` },
    { min: p50, max: p75, label: `${Math.round(p50)} - ${Math.round(p75)}` },
    { min: p75, max: maxPrice, label: `${Math.round(p75)} - ${Math.round(maxPrice)}` }
  ];
  
  // Add quartile ranges, avoiding duplicates
  quartileRanges.forEach(range => {
    if (range.min !== range.max && range.min < range.max) {
      ranges.push({
        ...range,
        count: 0
      });
    }
  });
  
  // Add "Over" range if maxPrice is significantly higher than p75
  if (maxPrice > p75 * 1.5) {
    ranges.push({
      min: Math.round(p75),
      max: Infinity,
      label: `Over ${Math.round(p75)}`,
      count: 0
    });
  }
  
  // Count products in each range
  ranges.forEach(range => {
    range.count = prices.filter(price => {
      if (range.max === Infinity) {
        return price >= range.min;
      }
      return price >= range.min && price < range.max;
    }).length;
  });
  
  // Remove ranges with 0 products and sort by min value
  return ranges
    .filter(range => range.count > 0)
    .sort((a, b) => a.min - b.min);
}

async function getPriceRanges(req, res) {
  try {
    const categorySlug = req.query.category || null;
    const tagSlug = req.query.tag || null;

    // Generate cache key
    const cacheKey = `price-ranges:${categorySlug || 'all'}:${tagSlug || 'all'}`;
    
    // Check if Redis cache is available
    if (req.cache) {
      const cachedData = await req.cache.get(cacheKey);
      if (cachedData) {
        return res.status(200).json({
          status: "success",
          message: "Price ranges retrieved successfully",
          response: cachedData,
          cached: true
        });
      }
    }

    let categoryId = null;
    let tagId = null;

    // Resolve category_id if categorySlug is provided
    if (categorySlug) {
      const [categoryResult] = await pool.execute(
        `SELECT category_id FROM res_product_categories WHERE slug = ?`,
        [categorySlug]
      );

      if (categoryResult.length === 0) {
        return res.status(404).json({ 
          status: "error",
          message: "Category not found" 
        });
      }

      categoryId = categoryResult[0].category_id;
    }

    // Resolve tag_id if tagSlug is provided
    if (tagSlug) {
      const [tagResult] = await pool.execute(
        `SELECT tag_id FROM res_product_tags WHERE slug = ?`,
        [tagSlug]
      );

      if (tagResult.length === 0) {
        return res.status(404).json({ 
          status: "error",
          message: "Tag not found" 
        });
      }

      tagId = tagResult[0].tag_id;
    }

    // Build the base query for getting price data
    let baseQuery = `
      SELECT 
        p.sale_price,
        p.original_price
      FROM res_products p
      WHERE p.status = 2 AND p.sale_price IS NOT NULL AND p.sale_price > 0
    `;

    const queryParams = [];

    // Add category filter if provided
    if (categoryId) {
      baseQuery += `
        AND p.product_id IN (
          SELECT pcr.product_id 
          FROM res_product_category_relationship pcr 
          WHERE pcr.category_id = ?
        )
      `;
      queryParams.push(categoryId);
    }

    // Add tag filter if provided
    if (tagId) {
      baseQuery += `
        AND p.product_id IN (
          SELECT ptr.product_id 
          FROM res_product_tag_relationship ptr 
          WHERE ptr.tag_id = ?
        )
      `;
      queryParams.push(tagId);
    }

    // Execute the query to get all prices
    const [priceRows] = await pool.execute(baseQuery, queryParams);

    if (priceRows.length === 0) {
      const emptyResponse = {
        ranges: [],
        summary: {
          minPrice: 0,
          maxPrice: 0,
          totalProducts: 0
        }
      };

      // Cache empty result for 5 minutes
      if (req.cache) {
        await req.cache.set(cacheKey, emptyResponse, 300);
      }

      return res.status(200).json({
        status: "success",
        message: "No products found for price range calculation",
        response: emptyResponse,
        cached: false
      });
    }

    // Extract prices and calculate ranges
    const prices = priceRows.map(row => parseFloat(row.sale_price)).filter(price => !isNaN(price));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    // Calculate dynamic ranges based on actual data distribution
    const ranges = calculateDynamicRanges(prices, minPrice, maxPrice);

    // Calculate average price
    const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;

    const response = {
      ranges: ranges,
      summary: {
        minPrice: parseFloat(minPrice.toFixed(2)),
        maxPrice: parseFloat(maxPrice.toFixed(2)),
        averagePrice: parseFloat(averagePrice.toFixed(2)),
        totalProducts: prices.length
      }
    };

    // Cache the result for 10 minutes
    if (req.cache) {
      await req.cache.set(cacheKey, response, 600);
    }

    res.status(200).json({
      status: "success",
      message: "Price ranges retrieved successfully",
      response: response,
      cached: false
    });

  } catch (error) {
    console.error("Error fetching price ranges:", error);
    res.status(500).json({ 
      status: "error",
      message: "Internal Server Error",
      error: error.message 
    });
  }
}

async function getProductsByTag(req, res) {
  try {
    const { slug } = req.params; // Get tag slug from route parameter
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const offset = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder || 'desc';
    const minPrice = parseFloat(req.query.minPrice) || null;
    const maxPrice = parseFloat(req.query.maxPrice) || null;

    // Validate slug
    if (!slug) {
      return res.status(400).json({ 
        status: "error",
        message: "Tag slug is required" 
      });
    }

    // Generate cache key
    const cacheKey = `products:tag:${slug}:${page}:${limit}:${sortBy}:${sortOrder}:${minPrice || 'all'}:${maxPrice || 'all'}`;
    
    // Check if Redis cache is available
    if (req.cache) {
      const cachedData = await req.cache.get(cacheKey);
      if (cachedData) {
        return res.status(200).json({
          status: "success",
          message: "Products by tag retrieved successfully",
          response: cachedData,
          cached: true
        });
      }
    }

    // Fetch tag information
    const [tagResult] = await pool.execute(
      `SELECT tag_id, tag_name, slug FROM res_product_tags WHERE slug = ?`,
      [slug]
    );

    if (tagResult.length === 0) {
      return res.status(404).json({ 
        status: "error",
        message: "Tag not found" 
      });
    }

    const tag = tagResult[0];
    const tagId = tag.tag_id;

    // Build ORDER BY clause
    const orderByClause = buildOrderByClause(sortBy, sortOrder);

    // Build WHERE conditions for price filtering
    const whereConditions = ['ptr.tag_id = ?', 'p.status = 2'];
    const queryParams = [tagId];

    if (minPrice !== null) {
      whereConditions.push('p.sale_price >= ?');
      queryParams.push(minPrice);
    }

    if (maxPrice !== null) {
      whereConditions.push('p.sale_price <= ?');
      queryParams.push(maxPrice);
    }

    queryParams.push(limit, offset);

    // Fetch products with comprehensive data
    const [products] = await pool.execute(
      `SELECT 
        p.product_id,
        p.product_name, 
        p.slug,
        p.sku,
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
        p.reviews_count,
        p.created_at
      FROM res_products p
      JOIN res_product_tag_relationship ptr ON p.product_id = ptr.product_id
      WHERE ${whereConditions.join(' AND ')}
      ${orderByClause}
      LIMIT ? OFFSET ?`,
      queryParams
    );

    // If no products are found, return empty result
    if (products.length === 0) {
      const emptyResponse = {
        tag: {
          tag_id: tag.tag_id,
          tag_name: tag.tag_name,
          slug: tag.slug
        },
        data: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: limit,
          hasNextPage: false,
          hasPrevPage: false
        },
        summary: {
          totalProducts: 0,
          averagePrice: 0,
          priceRange: { min: 0, max: 0 }
        }
      };

      // Cache empty result for 5 minutes
      if (req.cache) {
        await req.cache.set(cacheKey, emptyResponse, 300);
      }

      return res.status(200).json({
        status: "success",
        message: "No products found with this tag",
        response: emptyResponse,
        cached: false
      });
    }

    // Get total count for pagination
    const countWhereConditions = ['ptr.tag_id = ?', 'p.status = 2'];
    const countParams = [tagId];

    if (minPrice !== null) {
      countWhereConditions.push('p.sale_price >= ?');
      countParams.push(minPrice);
    }

    if (maxPrice !== null) {
      countWhereConditions.push('p.sale_price <= ?');
      countParams.push(maxPrice);
    }

    const [countResult] = await pool.execute(
      `SELECT COUNT(*) AS total 
       FROM res_products p
       JOIN res_product_tag_relationship ptr ON p.product_id = ptr.product_id
       WHERE ${countWhereConditions.join(' AND ')}`,
      countParams
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Get product IDs for fetching related data
    const productIds = products.map(p => p.product_id);

    // Fetch media, categories, and tags for all products concurrently
    const [
      [mediaRows],
      [categoryRows],
      [tagRows]
    ] = await Promise.all([
      pool.execute(
        `SELECT 
          product_id, 
          type, 
          file_name, 
          is_cover
        FROM res_product_media
        WHERE product_id IN (${productIds.join(',')})`
      ),
      pool.execute(
        `SELECT 
          r.product_id,
          c.category_id, 
          c.category_name,
          c.slug
        FROM res_product_category_relationship r
        JOIN res_product_categories c ON r.category_id = c.category_id
        WHERE r.product_id IN (${productIds.join(',')})`
      ),
      pool.execute(
        `SELECT 
          r.product_id,
          t.tag_id, 
          t.tag_name,
          t.slug
        FROM res_product_tag_relationship r
        JOIN res_product_tags t ON r.tag_id = t.tag_id
        WHERE r.product_id IN (${productIds.join(',')})`
      )
    ]);

    // Group media by product
    const mediaMap = {};
    mediaRows.forEach(media => {
      if (!mediaMap[media.product_id]) {
        mediaMap[media.product_id] = [];
      }
      mediaMap[media.product_id].push(media);
    });

    // Group categories by product
    const categoryMap = {};
    categoryRows.forEach(category => {
      if (!categoryMap[category.product_id]) {
        categoryMap[category.product_id] = [];
      }
      categoryMap[category.product_id].push({
        category_id: category.category_id,
        category_name: category.category_name,
        slug: category.slug
      });
    });

    // Group tags by product
    const tagMap = {};
    tagRows.forEach(tag => {
      if (!tagMap[tag.product_id]) {
        tagMap[tag.product_id] = [];
      }
      tagMap[tag.product_id].push({
        tag_id: tag.tag_id,
        tag_name: tag.tag_name,
        slug: tag.slug
      });
    });

    // Format products with all data
    const formattedProducts = products.map(product => {
      const coverImage = mediaMap[product.product_id]?.find(m => m.is_cover);
      const allImages = mediaMap[product.product_id] || [];
      
      return {
        product_id: product.product_id,
        product_name: product.product_name,
        slug: product.slug,
        sku: product.sku,
        original_price: product.original_price,
        sale_price: product.sale_price,
        stock_quantity: product.stock_quantity,
        short_description: product.short_description,
        description: product.description,
        manufacturer: product.manufacturer,
        supplier: product.supplier,
        is_featured: product.is_featured,
        rating: product.rating,
        reviews_count: product.reviews_count,
        created_at: product.created_at,
        media: {
          cover_image: coverImage ? coverImage.file_name : null,
          images: allImages.map(img => ({
            type: img.type,
            file_name: img.file_name,
            is_cover: img.is_cover
          }))
        },
        categories: categoryMap[product.product_id] || [],
        tags: tagMap[product.product_id] || []
      };
    });

    // Calculate summary statistics
    const prices = products.filter(p => p.sale_price).map(p => parseFloat(p.sale_price));
    const averagePrice = prices.length > 0 ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0;
    const priceRange = prices.length > 0 ? {
      min: Math.min(...prices),
      max: Math.max(...prices)
    } : { min: 0, max: 0 };

    const response = {
      tag: {
        tag_id: tag.tag_id,
        tag_name: tag.tag_name,
        slug: tag.slug
      },
      data: formattedProducts,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      summary: {
        totalProducts: total,
        averagePrice: parseFloat(averagePrice.toFixed(2)),
        priceRange: {
          min: parseFloat(priceRange.min.toFixed(2)),
          max: parseFloat(priceRange.max.toFixed(2))
        }
      }
    };

    // Cache the result for 10 minutes
    if (req.cache) {
      await req.cache.set(cacheKey, response, 600);
    }

    res.status(200).json({
      status: "success",
      message: "Products by tag retrieved successfully",
      response: response,
      cached: false
    });

  } catch (error) {
    console.error("Error fetching products by tag:", error);
    res.status(500).json({ 
      status: "error",
      message: "Internal Server Error",
      error: error.message 
    });
  }
}

async function getProductDetails(req, res) {
  const { slug } = req.params;

  if (!slug) {
    return res.status(400).json({ error: "Product slug is required" });
  }

  // Generate cache key for product details
  const cacheKey = `product:details:${slug}`;
  
  // Check if Redis cache is available and try to get cached data
  if (req.cache) {
    const cachedData = await req.cache.get(cacheKey);
    if (cachedData) {
      return res.status(200).json({
        message: "Product details fetched successfully",
        data: cachedData,
        cached: true
      });
    }
  }

  let connection;
  try {
    connection = await pool.getConnection(); // Get connection from the pool

    // Start transaction
    await connection.beginTransaction();

    // Fetch product details by slug - COMPLETE with all fields
    const [productRows] = await connection.execute(
      `SELECT p.* FROM res_products p WHERE p.slug = ?`,
      [slug]
    );

    if (productRows.length === 0) {
      // Rollback transaction if product is not found
      await connection.rollback();
      return res.status(404).json({ error: "Product not found" });
    }

    const product = productRows[0];
    const productId = product.product_id;

    // Fetch associated media, categories, tags, variants, attributes, and custom fields concurrently
    const [
      [mediaRows],
      [categoryRows],
      [tagRows],
      [variantRows],
      [attributeRows],
      [fieldRows],
    ] = await Promise.all([
      connection.execute(
        `SELECT 
          media_id, 
          type, 
          file_name, 
          is_cover
        FROM res_product_media
        WHERE product_id = ?`,
        [productId]
      ),
      connection.execute(
        `SELECT 
          c.category_id, 
          c.category_name
        FROM res_product_category_relationship r
        JOIN res_product_categories c ON r.category_id = c.category_id
        WHERE r.product_id = ?`,
        [productId]
      ),
      connection.execute(
        `SELECT 
          t.tag_id, 
          t.tag_name
        FROM res_product_tag_relationship r
        JOIN res_product_tags t ON r.tag_id = t.tag_id
        WHERE r.product_id = ?`,
        [productId]
      ),
      connection.execute(
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
        WHERE product_id = ? AND is_active = 1`,
        [productId]
      ),
      connection.execute(
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
      ),
      connection.execute(
        `SELECT 
          field_id, 
          field_name, 
          field_type, 
          is_required
        FROM res_product_fields
        WHERE product_id = ?`,
        [productId]
      ),
    ]);

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

    // Cache the result if Redis is available (cache for 10 minutes)
    if (req.cache) {
      await req.cache.set(cacheKey, productDetails, 600);
    }

    res.status(200).json({
      message: "Product details fetched successfully",
      data: productDetails,
      cached: false
    });
  } catch (error) {
    console.error("Error fetching product details:", error);

    if (connection) {
      await connection.rollback(); // Rollback transaction on error
    }

    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    if (connection) {
      connection.release(); // Always release connection back to the pool
    }
  }
}

/**
 * Fetch digital and physical products only (exclude services)
 */
async function fetchDigitalPhysicalProducts(
  categorySlug,
  limit,
  offset,
  page,
  sortBy = 'created_at',
  sortOrder = 'desc',
  minPrice = null,
  maxPrice = null,
  productType = null
) {
  try {
    let categoryId = null;

    // Resolve category_id if categorySlug is provided
    if (categorySlug) {
      const [categoryResult] = await pool.execute(
        `SELECT category_id FROM res_product_categories WHERE slug = ?`,
        [categorySlug]
      );

      if (categoryResult.length === 0) {
        throw new Error("Invalid category");
      }

      categoryId = categoryResult[0].category_id;
    }

    // Prepare base query - exclude services, optionally filter by product_type
    let productTypeFilter = "p.product_type IN ('digital', 'physical')";
    if (productType && (productType.toLowerCase() === 'digital' || productType.toLowerCase() === 'physical')) {
      productTypeFilter = `p.product_type = ?`;
    }
    
    let baseQuery = `
      SELECT 
        p.product_name, 
        p.product_id,
        p.product_type,
        p.stock_quantity,
        p.sku,
        p.sale_price,
        p.original_price,
        p.supplier,
        p.manufacturer,
        p.status,
        p.slug,
        p.created_at
      FROM res_products p
      WHERE ${productTypeFilter}
        AND p.status = 2
    `;
    const queryParams = [];
    const whereConditions = [];
    
    // Add product_type parameter if filtering by specific type
    if (productType && (productType.toLowerCase() === 'digital' || productType.toLowerCase() === 'physical')) {
      queryParams.push(productType.toLowerCase());
    }

    // Add active status (already in WHERE)
    
    if (categoryId) {
      baseQuery += `
        AND EXISTS (
          SELECT 1 FROM res_product_category_relationship pcr 
          WHERE pcr.product_id = p.product_id AND pcr.category_id = ?
        )
      `;
      queryParams.push(categoryId);
    }

    // Add price filtering
    if (minPrice !== null) {
      whereConditions.push(`p.sale_price >= ?`);
      queryParams.push(minPrice);
    }

    if (maxPrice !== null) {
      whereConditions.push(`p.sale_price <= ?`);
      queryParams.push(maxPrice);
    }

    // Add WHERE clause if we have additional conditions
    if (whereConditions.length > 0) {
      baseQuery += ` AND ${whereConditions.join(' AND ')}`;
    }

    // Build ORDER BY clause
    const orderByClause = buildOrderByClause(sortBy, sortOrder);
    baseQuery += ` ${orderByClause} LIMIT ? OFFSET ?`;

    // Add pagination parameters
    queryParams.push(limit, offset);

    // Fetch product list
    const [products] = await pool.execute(baseQuery, queryParams);
    if (products.length === 0) {
      return {
        currentPage: page,
        totalPages: 1,
        totalCount: 0,
        data: [],
      };
    }

    // Fetch total product count with same conditions
    let countProductTypeFilter = "p.product_type IN ('digital', 'physical')";
    if (productType && (productType.toLowerCase() === 'digital' || productType.toLowerCase() === 'physical')) {
      countProductTypeFilter = `p.product_type = ?`;
    }
    
    let countQuery = `
      SELECT COUNT(*) AS total 
      FROM res_products p
      WHERE ${countProductTypeFilter}
        AND p.status = 2
    `;
    const countParams = [];
    const countWhereConditions = [];

    // Add product_type parameter if filtering by specific type
    if (productType && (productType.toLowerCase() === 'digital' || productType.toLowerCase() === 'physical')) {
      countParams.push(productType.toLowerCase());
    }

    if (categoryId) {
      countQuery += `
        AND EXISTS (
          SELECT 1 FROM res_product_category_relationship pcr 
          WHERE pcr.product_id = p.product_id AND pcr.category_id = ?
        )
      `;
      countParams.push(categoryId);
    }

    if (minPrice !== null) {
      countParams.push(minPrice);
      countWhereConditions.push(`p.sale_price >= ?`);
    }

    if (maxPrice !== null) {
      countParams.push(maxPrice);
      countWhereConditions.push(`p.sale_price <= ?`);
    }
    
    // Add WHERE conditions for count query
    if (countWhereConditions.length > 0) {
      countQuery += ` AND ${countWhereConditions.join(' AND ')}`;
    }

    const [[{ total }]] = await pool.execute(countQuery, countParams);

    // Fetch media and categories for the products
    const productIds = products.map((product) => product.product_id);
    const [media] = await pool.execute(
      `SELECT media_id, product_id, type, file_name, is_cover, created_at, updated_at 
       FROM res_product_media WHERE product_id IN (${productIds
         .map(() => "?")
         .join(",")})`,
      productIds
    );
    const [categories] = await pool.execute(
      `SELECT c.category_id, c.category_name, pcr.product_id 
       FROM res_product_categories c 
       JOIN res_product_category_relationship pcr ON c.category_id = pcr.category_id 
       WHERE pcr.product_id IN (${productIds.map(() => "?").join(",")})`,
      productIds
    );

    // Map media and categories
    const mediaMap = media.reduce((acc, item) => {
      if (!acc[item.product_id]) acc[item.product_id] = [];
      acc[item.product_id].push(item);
      return acc;
    }, {});
    const categoriesMap = categories.reduce((acc, item) => {
      if (!acc[item.product_id]) acc[item.product_id] = [];
      acc[item.product_id].push(item);
      return acc;
    }, {});

    // Format the product list
    const productList = products.map((product) => ({
      ...product,
      media: mediaMap[product.product_id] || [],
      categories: categoriesMap[product.product_id] || [],
    }));

    return {
      data: productList,
      perPage: limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    };
  } catch (error) {
    console.error("Error fetching data from the database:", error);
    throw error;
  }
}

module.exports = {
  getProductList,
  getProductListDigitalPhysical,
  getProductDetails,
  getRelatedProducts,
  getProductsByCategory,
  getProductsByTag,
  getPriceRanges,
};
