const {
    pool
} = require("../../config/database");

async function getCurrency(req, res) {
    try {

        const [rows] = await pool.query(
            `SELECT * FROM res_currencies WHERE status = 1`
        );

        // Get the last updated timestamp from res_options
        const [lastUpdatedOption] = await pool.query(
            "SELECT option_value FROM res_options WHERE option_name = 'rate_last_updated_at'"
        );

        const lastUpdatedAt = lastUpdatedOption.length > 0 ? lastUpdatedOption[0].option_value : null;

        res.status(200).json({
            data: rows,
            status: "success",
            last_updated_at: lastUpdatedAt,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Internal server error",
            status: "error",
        });
    }
}
async function addCurrency(req, res) {
    try {
        const {
            currency_code,
            status,
            currency_symbol,
            rate
        } = req.body;

        // Check if the currency code already exists
        const [currencyExists] = await pool.query(
            `SELECT * FROM res_currencies WHERE currency_code = ?`,
            [currency_code]
        );

        if (currencyExists.length) {
            // Currency exists, update it instead of inserting
            const [updateResult] = await pool.query(
                `UPDATE res_currencies SET status = ?, currency_symbol = ?, rate = ?, live_rate = ?, updated_at = NOW() WHERE currency_code = ?`,
                [status, currency_symbol, rate, rate, currency_code]
            );

            res.status(200).json({
                data: updateResult,
                status: "success",
                message: "Currency updated successfully",
            });
        } else {
            // Currency doesn't exist, insert new one
            const [insertResult] = await pool.query(
                `INSERT INTO res_currencies (currency_code, status, currency_symbol, rate, live_rate, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
                [currency_code, status, currency_symbol, rate, rate] // Set live_rate same as rate initially
            );

            res.status(200).json({
                data: insertResult,
                status: "success",
                message: "Currency added successfully",
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Internal server error",
            status: "error",
        });
    }
}

async function updateCurrency(req, res) {
    try {
        const {
            status,
            currency_symbol,
            rate,
            id
        } = req.body;

        if (!id) {
            return res.status(400).json({
                status: "error",
                message: "Currency id is required",
            });
        }

        const [rows] = await pool.query(
            `UPDATE res_currencies SET status = ?, currency_symbol = ?, rate = ? WHERE id = ?`,
            [status, currency_symbol, rate, id]
        );

        res.status(200).json({
            data: rows,
            status: "success",
            message: "Currency updated successfully",
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Internal server error",
            status: "error",
        });
    }
}

async function deleteCurrency(req, res) {
    try {
        const {
            currency
        } = req.body;
        console.log(currency);

        // check is_default currency

        const [isDefaultCurrency] = await pool.query(
            `SELECT * FROM res_options WHERE option_name = 'currency' AND option_value = ?`,
            [currency]
        );


        if (isDefaultCurrency.length) {
            return res.status(400).json({
                status: "error",
                message: "Cannot delete default currency",
            });
        }

        await pool.query(
            `DELETE FROM res_currencies WHERE currency_code = ?`,
            [currency]
        );

        res.status(200).json({
            status: "success",
            message: "Currency deleted successfully",
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Internal server error",
            status: "error",
        });
    }
}



module.exports = {
    getCurrency,
    addCurrency,
    updateCurrency,
    deleteCurrency,

};