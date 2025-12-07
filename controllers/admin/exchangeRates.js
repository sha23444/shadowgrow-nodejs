const API_KEY = "85ecf65a0236de5aa7708d4b";
const BASE_URL = "https://v6.exchangerate-api.com/v6/";
const {
    pool
} = require("../../config/database");
const axios = require("axios");

async function getAllCurrencies(req, res) {
    try {
        const [currencies] = await pool.query(
            "SELECT * FROM res_currencies WHERE status = 0"
        );

        res.status(200).json({
            status: "success",
            message: "Currencies fetched successfully",
            data: currencies,
        });
    } catch (error) {
        console.error("Error:", error.message);
        res
            .status(500)
            .json({
                message: "An error occurred",
                error: error.message
            });
    }
}

async function getLatestExchangeRates(req, res) {
    console.log('getLatestExchangeRates');
    try {
        // Get the base currency of the store
        const [storeBaseCurrency] = await pool.query(
            "SELECT option_value FROM res_options WHERE option_name = 'currency'"
        );
        console.log('storeBaseCurrency', storeBaseCurrency);

        if (!storeBaseCurrency.length || !storeBaseCurrency[0].option_value) {
            throw new Error("Base currency not found in the database");
        }

        const baseCurrency = storeBaseCurrency[0].option_value;

        // Fetch the currency rates from the API
        const response = await axios.get(
            `${BASE_URL}${API_KEY}/latest/${baseCurrency}`
        );
        console.log('response', response.data);

        if (!response.data || !response.data.conversion_rates) {
            throw new Error("Invalid response from the exchange rate API");
        }

        const rates = response.data.conversion_rates;
        const lastUpdatedAt = new Date(
            response.data.time_last_update_utc
        ).toISOString(); // Ensure valid ISO format

        console.log('rates', rates);

        // Update or insert currencies in res_currencies table
        for (const [currencyCode, exchangeRate] of Object.entries(rates)) {
            // Check if currency exists
            const [existingCurrency] = await pool.query(
                "SELECT id FROM res_currencies WHERE currency_code = ?",
                [currencyCode]
            );

            if (existingCurrency.length > 0) {
                // Currency exists, update ONLY live_rate with readable format (keep rate unchanged)
                const readableLiveRate = 1 / exchangeRate;
                await pool.query(
                    `UPDATE res_currencies SET live_rate = ? WHERE currency_code = ?`,
                    [readableLiveRate, currencyCode]
                );
                console.log(`✓ Updated existing currency: ${currencyCode} - live_rate: ${readableLiveRate.toFixed(4)} (rate unchanged)`);
            } else {
                // Currency doesn't exist, insert new currency with readable live_rate
                try {
                    const readableLiveRate = 1 / exchangeRate;
                    await pool.query(
                        `INSERT INTO res_currencies (currency_code, status, currency_symbol, rate, live_rate, is_default, created_at, updated_at) 
                         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                        [currencyCode, 0, '', exchangeRate, readableLiveRate, 0]
                    );
                    console.log(`✓ Inserted new currency: ${currencyCode} - rate: ${exchangeRate}, live_rate: ${readableLiveRate.toFixed(4)} (status: inactive)`);
                } catch (insertError) {
                    console.error(`✗ Failed to insert currency ${currencyCode}:`, insertError.message);
                    // Continue with other currencies even if one fails
                }
            }
        }

        // Add/Update the rate_last_updated_at option in res_options table
        await pool.query(
            `INSERT INTO res_options (option_name, option_value) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE option_value = VALUES(option_value)`,
            ['rate_last_updated_at', lastUpdatedAt]
        );

        // Get summary of processed currencies
        const [totalCurrencies] = await pool.query(
            "SELECT COUNT(*) as total FROM res_currencies WHERE status = 1"
        );
        const [currenciesWithLiveRate] = await pool.query(
            "SELECT COUNT(*) as total FROM res_currencies WHERE status = 1 AND live_rate IS NOT NULL"
        );

        console.log(`📊 Summary: Total currencies: ${totalCurrencies[0].total}, With live_rate: ${currenciesWithLiveRate[0].total}`);

        res.status(200).json({
            message: "Currency rates updated successfully. New currencies may have been added if they didn't exist.",
            lastUpdatedAt: lastUpdatedAt,
            summary: {
                totalCurrencies: totalCurrencies[0].total,
                currenciesWithLiveRate: currenciesWithLiveRate[0].total
            }
        });
    } catch (error) {
        console.error("Error:", error.message);
        res
            .status(500)
            .json({
                message: "An error occurred",
                error: error.message
            });
    }
}

async function getLastUpdatedTimestamp(req, res) {
    try {
        const [lastUpdated] = await pool.query(
            "SELECT option_value FROM res_options WHERE option_name = 'rate_last_updated_at'"
        );

        if (!lastUpdated.length) {
            return res.status(200).json({
                status: "success",
                message: "No rate update timestamp found",
                data: null
            });
        }

        res.status(200).json({
            status: "success",
            message: "Last updated timestamp fetched successfully",
            data: {
                lastUpdatedAt: lastUpdated[0].option_value
            }
        });
    } catch (error) {
        console.error("Error:", error.message);
        res
            .status(500)
            .json({
                message: "An error occurred",
                error: error.message
            });
    }
}

async function getCurrencyUpdateStats(req, res) {
    try {
        // Get total currencies count
        const [totalCurrencies] = await pool.query(
            "SELECT COUNT(*) as total FROM res_currencies WHERE status = 1"
        );

        // Get currencies with live_rate
        const [currenciesWithLiveRate] = await pool.query(
            "SELECT COUNT(*) as with_live_rate FROM res_currencies WHERE status = 1 AND live_rate IS NOT NULL"
        );

        // Get last update timestamp
        const [lastUpdated] = await pool.query(
            "SELECT option_value FROM res_options WHERE option_name = 'rate_last_updated_at'"
        );

        res.status(200).json({
            status: "success",
            message: "Currency update statistics fetched successfully",
            data: {
                totalCurrencies: totalCurrencies[0].total,
                currenciesWithLiveRate: currenciesWithLiveRate[0].with_live_rate,
                lastUpdatedAt: lastUpdated.length > 0 ? lastUpdated[0].option_value : null
            }
        });
    } catch (error) {
        console.error("Error:", error.message);
        res
            .status(500)
            .json({
                message: "An error occurred",
                error: error.message
            });
    }
}



module.exports = {
    getAllCurrencies,
    getLatestExchangeRates,
    getLastUpdatedTimestamp,
    getCurrencyUpdateStats,
};