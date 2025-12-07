const bcrypt = require('bcrypt');
const crypto = require('crypto');

const SHOWCASE_EMAIL = 'showcase.user@example.com';
const SHOWCASE_USERNAME = 'showcase_user';
const SHOWCASE_PASSWORD = 'DemoUser@123';

async function ensureShowcaseUser(knex) {
  let user = await knex('res_users')
    .where({ email: SHOWCASE_EMAIL })
    .first();

  if (user) {
    return user;
  }

  const passwordHash = await bcrypt.hash(SHOWCASE_PASSWORD, 10);
  const now = new Date();

  const [userId] = await knex('res_users').insert({
    username: SHOWCASE_USERNAME,
    password: passwordHash,
    email: SHOWCASE_EMAIL,
    first_name: 'Showcase',
    last_name: 'User',
    phone: '5551234567',
    dial_code: '+1',
    country_code: 'US',
    user_type: 2,
    role_id: null,
    is_email_verified: 1,
    is_mobile_verified: 1,
    status: 1,
    balance: 250.0,
    register_type: 'seed',
    photo: null,
    ip_address: '203.0.113.10',
    last_login_at: now,
    created_at: now,
    updated_at: now,
  });

  return {
    user_id: userId,
    email: SHOWCASE_EMAIL,
  };
}

async function ensureFile(knex) {
  let file = await knex('res_files')
    .select('file_id', 'title', 'size', 'url', 'url_type')
    .first();

  if (file) {
    return file;
  }

  const now = new Date();
  const [fileId] = await knex('res_files').insert({
    folder_id: 1,
    title: 'Showcase Firmware Bundle',
    description: 'Seeded firmware bundle for showcase analytics data.',
    size: 10485760,
    price: 0,
    url: 'https://example.com/downloads/showcase-firmware.zip',
    url_type: 'direct',
    server_id: 0,
    visits: 0,
    downloads: 0,
    is_active: 1,
    is_new: 1,
    is_featured: 0,
    rating_count: 0,
    rating_points: 0,
    date_new: now,
    updated_at: now,
    c_user_id: 0,
    u_user_id: 0,
  });

  return {
    file_id: fileId,
    title: 'Showcase Firmware Bundle',
    size: 10485760,
    url: 'https://example.com/downloads/showcase-firmware.zip',
    url_type: 'direct',
  };
}

async function ensurePackage(knex) {
  let pkg = await knex('res_download_packages')
    .first(
      'package_id',
      'title',
      'bandwidth',
      'bandwidth_files',
      'extra',
      'extra_files',
      'fair',
      'fair_files',
      'devices',
      'price',
      'period',
    );

  if (pkg) {
    return pkg;
  }

  const now = new Date();
  const [packageId] = await knex('res_download_packages').insert({
    title: 'Showcase Subscription',
    description: 'Seeded subscription plan for showcase analytics data.',
    price: 79.99,
    bandwidth: 20480,
    bandwidth_files: 200,
    extra: 4096,
    extra_files: 40,
    fair: 10240,
    fair_files: 100,
    devices: 5,
    period: 180,
    is_active: 1,
    created_at: now,
    updated_at: now,
  });

  return {
    package_id: packageId,
    title: 'Showcase Subscription',
    bandwidth: 20480,
    bandwidth_files: 200,
    extra: 4096,
    extra_files: 40,
    fair: 10240,
    fair_files: 100,
    devices: 5,
    price: 79.99,
    period: 180,
  };
}

exports.seed = async function showcaseSeed(knex) {
  console.log('🌱 Seeding showcase user analytics data...');

  const trx = await knex.transaction();

  try {
    const user = await ensureShowcaseUser(trx);
    const file = await ensureFile(trx);
    const pkg = await ensurePackage(trx);
    const userId = user.user_id;

    // Clean previous showcase records to keep seed idempotent
    await trx('res_udownloads').where({ user_id: userId }).del();
    await trx('res_upackages').where({ user_id: userId }).del();
    await trx('res_transfers').where({ user_id: userId }).del();
    await trx('res_uwallet_recharge').where({ user_id: userId }).del();
    await trx('res_transactions').where({ user_id: userId }).del();
    await trx('res_orders').where({ user_id: userId }).del();

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const orderAmount = 149.99;
    const taxAmount = 11.5;
    const discountAmount = 15;
    const paidAmount = orderAmount - discountAmount + taxAmount;

    const itemTypes = [1, 2, 5]; // files, packages, wallet recharge

    const [orderId] = await trx('res_orders').insert({
      user_id: userId,
      transaction_id: `ORD-${Date.now()}`,
      currency: 'USD',
      subtotal: orderAmount,
      total_amount: paidAmount,
      amount_due: 0,
      amount_paid: paidAmount,
      order_status: 7,
      payment_status: 2,
      exchange_rate: 1,
      notes: 'Showcase user seeded mixed order (files + subscription + wallet recharge).',
      item_types: JSON.stringify(itemTypes),
      payment_method: 1,
      created_at: sevenDaysAgo,
      updated_at: now,
      tax: taxAmount,
      tax_breakdown: JSON.stringify({
        subtotal: orderAmount,
        tax_rate: 0.077,
        tax_amount: taxAmount,
        tax_type: 'VAT',
        currency: 'USD',
      }),
      discount_details: JSON.stringify({
        discount_code: 'SHOWCASE',
        discount_type: 'fixed',
        discount_amount: discountAmount,
        applied_at: sevenDaysAgo.toISOString(),
      }),
      discount: discountAmount,
    });

    await trx('res_transactions').insert({
      order_id: orderId,
      user_id: userId,
      currency: 'USD',
      amount: paidAmount,
      exchange_rate: 1,
      payment_status: 2,
      payment_method: 1,
      payment_date: sevenDaysAgo,
      gateway_txn_id: `TX-${Date.now()}`,
      gateway_response: JSON.stringify({
        status: 'success',
        message: 'Seeded showcase transaction',
      }),
      created_at: sevenDaysAgo,
      updated_at: now,
    });

    await trx('res_upackages').insert({
      package_id: pkg.package_id,
      order_id: orderId,
      package_title: pkg.title,
      package_object: JSON.stringify(pkg),
      user_id: userId,
      bandwidth: pkg.bandwidth || 0,
      bandwidth_files: pkg.bandwidth_files || 0,
      extra: pkg.extra || 0,
      extra_files: pkg.extra_files || 0,
      fair: pkg.fair || 0,
      fair_files: pkg.fair_files || 0,
      devices: pkg.devices || 1,
      devices_fp: null,
      is_active: 1,
      is_current: 1,
      is_free: pkg.price === 0 ? 1 : 0,
      notes: 'Seeded showcase active subscription',
      date_create: sevenDaysAgo,
      date_expire: thirtyDaysAhead,
    });

    await trx('res_uwallet_recharge').insert({
      user_id: userId,
      order_id: orderId,
      amount: 50,
      meta: JSON.stringify({
        source: 'seed',
        reference: 'SHOWCASE-TOPUP',
      }),
      created_at: sevenDaysAgo,
      updated_at: sevenDaysAgo,
    });

    const transferRows = [
      {
        user_id: userId,
        amount: 200,
        order_id: null,
        type: 'credit',
        notes: 'Seed credit for showcase user wallet',
        description: 'Admin seeded wallet credit',
        created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      },
      {
        user_id: userId,
        amount: 75.5,
        order_id: orderId,
        type: 'debit',
        notes: 'Seed debit for showcase order',
        description: 'Wallet charge linked to showcase order',
        created_at: sevenDaysAgo,
      },
    ];

    await trx('res_transfers').insert(transferRows);

    await trx('res_udownloads').insert({
      user_id: userId,
      file_id: file.file_id,
      upackage_id: null,
      order_id: orderId,
      file_title: file.title,
      file_size: file.size || 10485760,
      download_url: file.url,
      file_url: file.url,
      url_type: file.url_type || 'direct',
      ip_address: '198.51.100.42',
      hash_token: crypto.randomBytes(24).toString('hex'),
      created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      expired_at: thirtyDaysAhead,
    });

    // Keep the user's balance aligned with seeded credit/debit activity
    await trx('res_users')
      .where({ user_id: userId })
      .update({
        balance: 250 - 75.5 + 50,
        last_login_at: now,
        updated_at: now,
      });

    await trx.commit();
    console.log('✅ Showcase user analytics data seeded successfully.');
  } catch (error) {
    await trx.rollback();
    console.error('❌ Failed to seed showcase user analytics data:', error);
    throw error;
  }
};

