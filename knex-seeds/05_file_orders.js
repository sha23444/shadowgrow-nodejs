const { faker } = require('@faker-js/faker');

exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex('res_ufiles').del();
  
  // Get paid files and users
  const paidFiles = await knex('res_files').select('*').where('price', '>', 0);
  const users = await knex('res_users').select('user_id', 'username', 'email', 'first_name', 'last_name').limit(100);

  if (paidFiles.length === 0 || users.length === 0) {
    console.log('⚠️  No paid files or users found. Please run files and users seeds first.');
    return;
  }

  console.log(`🛒 Creating file purchase orders for ${paidFiles.length} paid files...`);

  const currencies = ['USD', 'EUR', 'INR', 'GBP', 'CAD'];
  const paymentMethods = [1, 2, 3, 4, 5, 6]; // Various payment methods
  const orders = [];
  const userFiles = [];

  // Create 50 file purchase orders
  for (let i = 0; i < 50; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    
    // Each user buys 1-3 files
    const numFiles = Math.floor(Math.random() * 3) + 1;
    const selectedFiles = faker.helpers.arrayElements(paidFiles, numFiles);
    
    // Calculate totals
    const subtotal = selectedFiles.reduce((sum, file) => sum + parseFloat(file.price), 0);
    const taxRate = faker.number.float({ min: 0.08, max: 0.15, fractionDigits: 3 });
    const tax = subtotal * taxRate;
    const totalAmount = subtotal + tax;
    
    // Generate order
    const order = {
      user_id: user.user_id,
      subtotal: subtotal,
      total_amount: totalAmount,
      amount_due: totalAmount,
      amount_paid: totalAmount, // Assume all are paid
      tax: tax,
      discount: 0,
      exchange_rate: faker.number.float({ min: 0.8, max: 1.2, fractionDigits: 4 }),
      payment_method: faker.helpers.arrayElement(paymentMethods),
      payment_status: 2, // Paid
      order_status: 7, // Completed
      currency: faker.helpers.arrayElement(currencies),
      notes: `Mobile firmware files: ${selectedFiles.map(f => f.title).join(', ')}`,
      item_types: JSON.stringify([1]), // Digital Files
      tax_breakdown: JSON.stringify({
        subtotal: subtotal,
        tax_rate: taxRate,
        tax_amount: tax,
        tax_type: 'VAT',
        currency: faker.helpers.arrayElement(currencies)
      }),
      discount_details: null,
      created_at: faker.date.between({
        from: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
        to: new Date()
      }),
      updated_at: new Date()
    };

    orders.push(order);
  }

  // Insert orders
  console.log(`📦 Creating ${orders.length} file purchase orders...`);
  
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const [orderResult] = await knex('res_orders').insert(order).returning('order_id');
    const orderId = orderResult;

    // Add user files for this order
    const user = users.find(u => u.user_id === order.user_id);
    const numFiles = Math.floor(Math.random() * 3) + 1;
    const selectedFiles = faker.helpers.arrayElements(paidFiles, numFiles);
    
    for (const file of selectedFiles) {
      userFiles.push({
        user_id: order.user_id,
        file_id: file.file_id,
        price: file.price,
        order_id: orderId,
        is_active: 1
      });
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  ✅ Created ${i + 1}/${orders.length} orders`);
    }
  }

  // Insert user files in batches
  console.log(`📄 Creating ${userFiles.length} user file purchases...`);
  
  const batchSize = 50;
  for (let i = 0; i < userFiles.length; i += batchSize) {
    const batch = userFiles.slice(i, i + batchSize);
    await knex('res_ufiles').insert(batch);
    console.log(`  📄 Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(userFiles.length / batchSize)}`);
  }

  // Generate summary statistics
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.amount_paid), 0);
  const avgOrderValue = totalRevenue / totalOrders;

  console.log(`\n🎉 File Purchase Orders Created Successfully!`);
  console.log(`📊 Summary:`);
  console.log(`   - File orders created: ${totalOrders}`);
  console.log(`   - Total file purchases: ${userFiles.length}`);
  console.log(`   - Total revenue: $${totalRevenue.toFixed(2)}`);
  console.log(`   - Average order value: $${avgOrderValue.toFixed(2)}`);

  // Show top selling files
  const fileSales = {};
  userFiles.forEach(uf => {
    const file = paidFiles.find(f => f.file_id === uf.file_id);
    if (file) {
      if (!fileSales[file.file_id]) {
        fileSales[file.file_id] = {
          title: file.title,
          price: file.price,
          sales: 0,
          revenue: 0
        };
      }
      fileSales[file.file_id].sales++;
      fileSales[file.file_id].revenue += parseFloat(file.price);
    }
  });

  const topFiles = Object.values(fileSales)
    .sort((a, b) => b.sales - a.sales || b.revenue - a.revenue)
    .slice(0, 5);

  console.log(`\n🏆 Top Selling Files:`);
  topFiles.forEach((file, index) => {
    console.log(`   ${index + 1}. ${file.title} - $${file.price} (${file.sales} sales, $${file.revenue.toFixed(2)} revenue)`);
  });

  console.log(`\n📱 Mobile Firmware File Orders Created Successfully!`);
};
