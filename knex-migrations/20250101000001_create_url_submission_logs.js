/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    // Check if table already exists
    const hasTable = await knex.schema.hasTable('res_url_submission_logs');
    
    if (!hasTable) {
        return knex.schema.createTable('res_url_submission_logs', function(table) {
            table.increments('id').primary();
            table.string('url', 500).notNullable();
            table.enum('status', ['success', 'error', 'pending']).notNullable();
            table.text('message').nullable();
            table.timestamp('created_at').defaultTo(knex.fn.now());
            
            // Add indexes for better performance
            table.index(['status', 'created_at']);
            table.index(['url']);
        });
    } else {
        console.log('res_url_submission_logs table already exists, skipping...');
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.dropTable('res_url_submission_logs');
};
