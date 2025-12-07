/**
 * Migration: Add Contact Us Enquiry and Request File modules
 * Date: 2025-01-28
 * Description: 
 * - Adds "Contact Us Enquiry" module (standalone, no children)
 * - Adds "Request File" module (standalone, no children)
 */

exports.up = async function(knex) {
  try {
    await knex.transaction(async (trx) => {
      // Check if modules already exist
      const existingContact = await trx('telegram_modules')
        .where('module_key', 'contact_us_enquiry')
        .first();
      
      const existingRequest = await trx('telegram_modules')
        .where('module_key', 'request_file')
        .first();

      // Add Contact Us Enquiry module
      if (!existingContact) {
        await trx('telegram_modules').insert({
          module_key: 'contact_us_enquiry',
          module_name: 'Contact Us Enquiry',
          category: 'Contact',
          parent_module_id: null,
          description: 'Notifications for contact us form submissions',
          sort_order: 3,
          is_active: true
        });
        console.log('✅ Added Contact Us Enquiry module');
      } else {
        console.log('⚠️ Contact Us Enquiry module already exists');
      }

      // Add Request File module
      if (!existingRequest) {
        await trx('telegram_modules').insert({
          module_key: 'request_file',
          module_name: 'Request File',
          category: 'Request',
          parent_module_id: null,
          description: 'Notifications for file download requests',
          sort_order: 4,
          is_active: true
        });
        console.log('✅ Added Request File module');
      } else {
        console.log('⚠️ Request File module already exists');
      }
    });
  } catch (error) {
    console.error('❌ Error adding modules:', error);
    throw error;
  }
};

exports.down = async function(knex) {
  try {
    await knex.transaction(async (trx) => {
      // Delete Contact Us Enquiry module
      await trx('telegram_modules')
        .where('module_key', 'contact_us_enquiry')
        .delete();
      
      // Delete Request File module
      await trx('telegram_modules')
        .where('module_key', 'request_file')
        .delete();
      
      console.log('✅ Removed Contact Us Enquiry and Request File modules');
    });
  } catch (error) {
    console.error('❌ Error removing modules:', error);
    throw error;
  }
};

