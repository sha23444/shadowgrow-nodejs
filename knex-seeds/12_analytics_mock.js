const { faker } = require('@faker-js/faker');
const { subDays, addDays } = require('date-fns');

const DOWNLOAD_RECORDS = 1500;

const paymentMethodNames = {
  1: 'Razorpay',
  2: 'Manual',
  3: 'Account Balance',
  4: 'Binance',
  5: 'Cashfree',
  6: 'PayPal',
  7: 'INR Portal',
  8: 'Coin Flex Pay',
  9: 'Free Order',
};

exports.seed = async function seedAnalyticsMock(knex) {
  console.log('🌱 Seeding analytics helper data (downloads & transactions)...');

  await knex('res_udownloads').del();
  await knex('res_transactions').del();

  const users = await knex('res_users').select('user_id').limit(500);
  const files = await knex('res_files')
    .select('file_id', 'title', 'size', 'url', 'url_type')
    .limit(120);
  const orders = await knex('res_orders')
    .select(
      'order_id',
      'user_id',
      'currency',
      'amount_paid',
      'total_amount',
      'payment_method',
      'payment_status',
      'created_at',
      'item_types'
    )
    .orderBy('created_at', 'desc')
    .limit(400);

  const packages = await knex('res_download_packages').select('*');

  if (!users.length || !files.length || !orders.length) {
    console.warn(
      '⚠️  Missing prerequisite data (users/files/orders). Run base seeds first.'
    );
    return;
  }

  const downloadRows = [];
  const now = new Date();

  const pickWeightedDate = () => {
    const roll = Math.random();
    if (roll < 0.55) {
      return faker.date.between({ from: subDays(now, 14), to: now });
    }
    if (roll < 0.8) {
      return faker.date.between({ from: subDays(now, 60), to: subDays(now, 15) });
    }
    return faker.date.between({ from: subDays(now, 180), to: subDays(now, 61) });
  };

  for (let i = 0; i < DOWNLOAD_RECORDS; i++) {
    const user = faker.helpers.arrayElement(users);
    const file = faker.helpers.arrayElement(files);
    const order = faker.helpers.arrayElement(orders);

    const createdAt = pickWeightedDate();

    downloadRows.push({
      user_id: user.user_id,
      file_id: file.file_id,
      upackage_id: null,
      order_id: order.order_id,
      file_title: file.title,
      file_size: file.size || faker.number.int({ min: 5_000_000, max: 6_000_000_000 }),
      download_url: file.url,
      file_url: file.url,
      url_type: file.url_type || 'direct',
      ip_address: faker.internet.ip(),
      hash_token: faker.string.alphanumeric({ length: 48 }),
      created_at: createdAt,
      expired_at: addDays(createdAt, 45),
    });
  }

  await knex.batchInsert('res_udownloads', downloadRows, 200);
  console.log(`  📥 Inserted ${downloadRows.length} download records`);

  const transactionRows = [];

  orders.forEach(order => {
    const amount = Number(order.amount_paid) || Number(order.total_amount) || 0;
    const isPaid = order.payment_status === 2 || amount > 0;
    const paymentDate = pickWeightedDate();
    const fallbackMethod = Number(
      faker.helpers.arrayElement(Object.keys(paymentMethodNames))
    );
    const paymentMethod = order.payment_method || fallbackMethod;
    transactionRows.push({
      order_id: order.order_id,
      user_id: order.user_id,
      currency: order.currency || 'USD',
      amount: amount || faker.number.float({ min: 9, max: 199, fractionDigits: 2 }),
      exchange_rate: faker.number.float({ min: 0.85, max: 1.25, fractionDigits: 4 }),
      payment_status: isPaid ? 2 : faker.helpers.arrayElement([1, 3, 4]),
      payment_method: paymentMethod,
      payment_date: paymentDate,
      gateway_txn_id: `GA-${faker.string.alphanumeric({ length: 12 }).toUpperCase()}`,
      gateway_response: JSON.stringify({
        status: isPaid ? 'success' : 'pending',
        message: `${
          paymentMethodNames[paymentMethod] || 'Unknown'
        } transaction`,
      }),
      created_at: paymentDate,
      updated_at: paymentDate,
    });
  });

  await knex.batchInsert('res_transactions', transactionRows, 200);
  console.log(`  💳 Inserted ${transactionRows.length} transaction records`);

  const ordersWithPackages = orders.filter(order => {
    try {
      const itemTypes = JSON.parse(order.item_types || '[]');
      order.__itemTypes = itemTypes;
      return Array.isArray(itemTypes) && itemTypes.includes(2);
    } catch {
      order.__itemTypes = [];
      return false;
    }
  });

  let packageRows = [];
  if (packages.length && ordersWithPackages.length) {
    const existingPackageOrders = await knex('res_upackages')
      .whereIn(
        'order_id',
        ordersWithPackages.map(order => order.order_id),
      )
      .select('order_id');

    const existingOrderIds = new Set(
      existingPackageOrders.map(row => row.order_id),
    );

    packageRows = ordersWithPackages.flatMap(order => {
      if (existingOrderIds.has(order.order_id)) {
        return [];
      }
      const selectedPackage = faker.helpers.arrayElement(packages);
      const startDate = order.created_at || new Date();
      const expireDate = addDays(
        new Date(startDate),
        selectedPackage.period || faker.number.int({ min: 30, max: 180 }),
      );
      return [
        {
          package_id: selectedPackage.package_id,
          order_id: order.order_id,
          package_title: selectedPackage.title,
          package_object: JSON.stringify(selectedPackage),
          user_id: order.user_id,
          bandwidth: selectedPackage.bandwidth ?? 0,
          bandwidth_files: selectedPackage.bandwidth_files ?? 0,
          extra: selectedPackage.extra ?? 0,
          extra_files: selectedPackage.extra_files ?? 0,
          fair: selectedPackage.fair ?? 0,
          fair_files: selectedPackage.fair_files ?? 0,
          devices: selectedPackage.devices ?? 1,
          devices_fp: null,
          is_active: 1,
          is_current: Math.random() < 0.7 ? 1 : 0,
          is_free: selectedPackage.price === 0 ? 1 : 0,
          notes: `Seeded package for order ${order.order_id}`,
          date_create: startDate,
          date_expire: expireDate,
        },
      ];
    });

    if (packageRows.length) {
      await knex.batchInsert('res_upackages', packageRows, 200);
      console.log(
        `  📦 Linked ${packageRows.length} package subscriptions to orders`,
      );
    } else {
      console.log('  📦 Package links already exist for sampled orders');
    }
  } else {
    console.log('  ⚠️ Skipped package linkage (no packages or eligible orders)');
  }

  console.log('✅ Analytics helper data seeded successfully.');
};

