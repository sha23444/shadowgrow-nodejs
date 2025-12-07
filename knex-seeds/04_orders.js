const { faker } = require('@faker-js/faker');

exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex('res_orders').del();

  // Get existing users, packages, and files
  const users = await knex('res_users').select('user_id').limit(300); // Limit to first 300 users
  const packages = await knex('res_download_packages').select('package_id', 'title', 'price');
  const files = await knex('res_files').select('file_id', 'title', 'price').limit(100);

  if (users.length === 0) {
    console.log('⚠️  No users found. Please run users seed first.');
    return;
  }

  console.log(`🛒 Creating orders for ${users.length} users...`);

  const orders = [];
  const currencies = ['USD', 'EUR', 'INR', 'GBP', 'CAD', 'AUD'];
  
  // Order distribution
  const orderDistribution = {
    // 50% package orders
    packages: 0.5,
    // 30% file orders
    files: 0.3,
    // 15% mixed orders (packages + files)
    mixed: 0.15,
    // 5% wallet recharge orders
    wallet: 0.05
  };

  // Payment method distribution
  const paymentMethodDistribution = {
    1: 0.25, // Razorpay
    2: 0.15, // Manual
    3: 0.20, // Account Balance
    4: 0.10, // Binance
    5: 0.10, // Cashfree
    6: 0.10, // PayPal
    7: 0.05, // INR Portal
    8: 0.03, // Coin Flex Pay
    9: 0.02  // Free Order
  };

  // Payment status distribution
  const paymentStatusDistribution = {
    1: 0.05, // Pending
    2: 0.85, // Paid
    3: 0.05, // Failed
    4: 0.05  // Refunded
  };

  // Order status distribution
  const orderStatusDistribution = {
    1: 0.05, // Pending
    2: 0.10, // Accepted
    3: 0.10, // Processing
    4: 0.05, // Shipped
    5: 0.05, // Out for Delivery
    6: 0.05, // Delivered
    7: 0.50, // Completed
    8: 0.05, // Cancelled
    9: 0.02, // Returned
    10: 0.02, // Refunded
    11: 0.01 // Partially Fulfilled
  };

  // Generate orders
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const userIndex = i + 1;
    
    // Determine order type based on distribution
    let orderType;
    const rand = Math.random();
    if (rand < orderDistribution.packages) {
      orderType = 'packages';
    } else if (rand < orderDistribution.packages + orderDistribution.files) {
      orderType = 'files';
    } else if (rand < orderDistribution.packages + orderDistribution.files + orderDistribution.mixed) {
      orderType = 'mixed';
    } else {
      orderType = 'wallet';
    }

    // Generate item types and calculate totals
    let itemTypes = [];
    let subtotal = 0;
    let notes = '';

    if (orderType === 'packages' && packages.length > 0) {
      // 1-3 packages per order
      const numPackages = faker.number.int({ min: 1, max: Math.min(3, packages.length) });
      const selectedPackages = faker.helpers.arrayElements(packages, numPackages);
      
      itemTypes.push(2); // Subscription Package
      subtotal = selectedPackages.reduce((sum, pkg) => sum + parseFloat(pkg.price), 0);
      notes = `Mobile firmware packages: ${selectedPackages.map(p => p.title).join(', ')}`;
    } else if (orderType === 'files' && files.length > 0) {
      // 1-5 files per order
      const numFiles = faker.number.int({ min: 1, max: Math.min(5, files.length) });
      const selectedFiles = faker.helpers.arrayElements(files, numFiles);
      
      itemTypes.push(1); // Digital Files
      subtotal = selectedFiles.reduce((sum, file) => sum + parseFloat(file.price), 0);
      notes = `Mobile firmware files: ${selectedFiles.map(f => f.title).join(', ')}`;
    } else if (orderType === 'mixed' && packages.length > 0 && files.length > 0) {
      // Mixed order with packages and files
      const numPackages = faker.number.int({ min: 1, max: Math.min(2, packages.length) });
      const numFiles = faker.number.int({ min: 1, max: Math.min(3, files.length) });
      const selectedPackages = faker.helpers.arrayElements(packages, numPackages);
      const selectedFiles = faker.helpers.arrayElements(files, numFiles);
      
      itemTypes.push(1, 2); // Digital Files + Subscription Package
      subtotal = selectedPackages.reduce((sum, pkg) => sum + parseFloat(pkg.price), 0) +
                selectedFiles.reduce((sum, file) => sum + parseFloat(file.price), 0);
      notes = `Mixed order: ${selectedPackages.map(p => p.title).join(', ')} + ${selectedFiles.map(f => f.title).join(', ')}`;
    } else if (orderType === 'wallet') {
      // Wallet recharge order
      itemTypes.push(5); // Wallet Recharge
      subtotal = faker.number.float({ min: 10, max: 500, fractionDigits: 2 });
      notes = `Wallet recharge for mobile firmware purchases`;
    }

    // Generate payment method
    const paymentMethodRand = Math.random();
    let paymentMethod = 1; // Default to Razorpay
    let cumulative = 0;
    for (const [method, probability] of Object.entries(paymentMethodDistribution)) {
      cumulative += probability;
      if (paymentMethodRand < cumulative) {
        paymentMethod = parseInt(method);
        break;
      }
    }

    // Generate payment status
    const paymentStatusRand = Math.random();
    let paymentStatus = 2; // Default to Paid
    cumulative = 0;
    for (const [status, probability] of Object.entries(paymentStatusDistribution)) {
      cumulative += probability;
      if (paymentStatusRand < cumulative) {
        paymentStatus = parseInt(status);
        break;
      }
    }

    // Generate order status
    const orderStatusRand = Math.random();
    let orderStatus = 7; // Default to Completed
    cumulative = 0;
    for (const [status, probability] of Object.entries(orderStatusDistribution)) {
      cumulative += probability;
      if (orderStatusRand < cumulative) {
        orderStatus = parseInt(status);
        break;
      }
    }

    // Calculate tax (5-15% of subtotal)
    const taxRate = faker.number.float({ min: 0.05, max: 0.15, fractionDigits: 3 });
    const tax = subtotal * taxRate;

    // Calculate discount (0-20% of subtotal, 30% chance)
    const hasDiscount = Math.random() < 0.3;
    const discountRate = hasDiscount ? faker.number.float({ min: 0.05, max: 0.20, fractionDigits: 3 }) : 0;
    const discount = subtotal * discountRate;

    // Calculate totals
    const totalAmount = subtotal + tax - discount;
    const amountDue = totalAmount;
    const amountPaid = paymentStatus === 2 ? totalAmount : (paymentStatus === 4 ? totalAmount : 0);

    // Generate exchange rate (1.0 for same currency, or different for foreign)
    const exchangeRate = faker.number.float({ min: 0.8, max: 1.2, fractionDigits: 4 });

    // Generate currency
    const currency = faker.helpers.arrayElement(currencies);

    // Generate dates
    const createdAt = faker.date.between({
      from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
      to: new Date()
    });
    const updatedAt = faker.date.between({
      from: createdAt,
      to: new Date()
    });

    // Generate tax breakdown
    const taxBreakdown = {
      subtotal: subtotal,
      tax_rate: taxRate,
      tax_amount: tax,
      tax_type: 'VAT',
      currency: currency
    };

    // Generate discount details (if applicable)
    const discountDetails = hasDiscount ? {
      discount_code: faker.string.alphanumeric(8).toUpperCase(),
      discount_type: 'percentage',
      discount_rate: discountRate,
      discount_amount: discount,
      applied_at: createdAt.toISOString()
    } : null;

    const order = {
      user_id: user.user_id,
      subtotal: subtotal,
      total_amount: totalAmount,
      amount_due: amountDue,
      amount_paid: amountPaid,
      tax: tax,
      discount: discount,
      exchange_rate: exchangeRate,
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      order_status: orderStatus,
      currency: currency,
      notes: notes,
      item_types: JSON.stringify(itemTypes),
      tax_breakdown: JSON.stringify(taxBreakdown),
      discount_details: discountDetails ? JSON.stringify(discountDetails) : null,
      created_at: createdAt,
      updated_at: updatedAt
    };

    orders.push(order);

    // Log progress every 50 orders
    if (userIndex % 50 === 0) {
      console.log(`  ✅ Processed ${userIndex}/${users.length} orders`);
    }
  }

  // Insert orders in batches
  const batchSize = 100;
  for (let i = 0; i < orders.length; i += batchSize) {
    const batch = orders.slice(i, i + batchSize);
    await knex('res_orders').insert(batch);
    console.log(`  🛒 Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(orders.length / batchSize)}`);
  }

  // Generate summary statistics
  const totalOrders = orders.length;
  const paidOrders = orders.filter(o => o.payment_status === 2).length;
  const completedOrders = orders.filter(o => o.order_status === 7).length;
  const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.amount_paid), 0);

  // Payment method statistics
  const paymentMethodStats = {};
  orders.forEach(order => {
    const method = order.payment_method;
    paymentMethodStats[method] = (paymentMethodStats[method] || 0) + 1;
  });

  // Order type statistics
  const orderTypeStats = {};
  orders.forEach(order => {
    const itemTypes = JSON.parse(order.item_types);
    if (itemTypes.includes(1)) orderTypeStats.files = (orderTypeStats.files || 0) + 1;
    if (itemTypes.includes(2)) orderTypeStats.packages = (orderTypeStats.packages || 0) + 1;
    if (itemTypes.includes(5)) orderTypeStats.wallet = (orderTypeStats.wallet || 0) + 1;
  });

  console.log(`\n🎉 Successfully created ${totalOrders} orders!`);
  console.log(`📊 Summary:`);
  console.log(`   - Total orders: ${totalOrders}`);
  console.log(`   - Paid orders: ${paidOrders} (${((paidOrders/totalOrders)*100).toFixed(1)}%)`);
  console.log(`   - Completed orders: ${completedOrders} (${((completedOrders/totalOrders)*100).toFixed(1)}%)`);
  console.log(`   - Total revenue: $${totalRevenue.toFixed(2)}`);
  
  console.log(`\n💳 Payment Method Distribution:`);
  Object.entries(paymentMethodStats).forEach(([method, count]) => {
    const methodNames = {
      1: 'Razorpay', 2: 'Manual', 3: 'Account Balance', 4: 'Binance',
      5: 'Cashfree', 6: 'PayPal', 7: 'INR Portal', 8: 'Coin Flex Pay', 9: 'Free Order'
    };
    console.log(`   - ${methodNames[method] || `Method ${method}`}: ${count} (${((count/totalOrders)*100).toFixed(1)}%)`);
  });

  console.log(`\n📦 Order Type Distribution:`);
  Object.entries(orderTypeStats).forEach(([type, count]) => {
    console.log(`   - ${type.charAt(0).toUpperCase() + type.slice(1)}: ${count} (${((count/totalOrders)*100).toFixed(1)}%)`);
  });

  console.log(`\n📱 Mobile Firmware Orders Created Successfully!`);
};
