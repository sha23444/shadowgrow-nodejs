const { pool } = require("../../config/database");
const { parseISO, isValid, differenceInDays, differenceInMonths, differenceInYears, format, addDays } = require('date-fns');
const { getDateRange } = require('../../controllers/utils/date');
const { PAYMENT_METHOD } = require('../utils/constants');

async function getBaseCurrencyInfo() {
    try {
        const [rows] = await pool.execute(
            `SELECT option_name, option_value 
             FROM res_options 
             WHERE option_name IN ('currency', 'currency_symbol')`
        );

        const currencyRow = rows.find(row => row.option_name === 'currency');
        const symbolRow = rows.find(row => row.option_name === 'currency_symbol');

        return {
            code: currencyRow ? currencyRow.option_value : 'USD',
            symbol: symbolRow ? symbolRow.option_value : '$'
        };
    } catch (error) {
        console.error('Error fetching base currency info:', error);
        return {
            code: 'USD',
            symbol: '$'
        };
    }
}

const SAFE_EXCHANGE_RATE_EXPRESSION = `CASE WHEN exchange_rate IS NULL OR exchange_rate = 0 THEN 1 ELSE exchange_rate END`;

function isValidDate(dateStr) {
    if (!dateStr) return false;
    const parsed = parseISO(dateStr);
    return isValid(parsed) && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function getDateOfISOWeek(week, year) {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = new Date(simple);
    if (dow <= 4)
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    return ISOweekStart;
}

async function getUsersChartData(req, res) {
    try {
        const { startDate: queryStart, endDate: queryEnd, filter } = req.query;
        let startDate, endDate;
        if (isValidDate(queryStart) && isValidDate(queryEnd)) {
            startDate = queryStart;
            endDate = queryEnd;
        } else if (filter) {
            ({ startDate, endDate } = getDateRange(filter));
        } else {
            ({ startDate, endDate } = getDateRange('Last 7 days'));
        }
        const daysDiff = differenceInDays(new Date(endDate), new Date(startDate));
        let selectDate, groupBy, labelFormat;
        if (daysDiff > 365) {
            // Yearly
            selectDate = `YEAR(created_at) AS year`;
            groupBy = `year`;
            labelFormat = row => `${row.year}`;
        } else if (daysDiff > 30) {
            // Monthly
            selectDate = `YEAR(created_at) AS year, MONTH(created_at) AS month`;
            groupBy = `year, month`;
            labelFormat = row => `${String(row.year).slice(-2)}-${String(row.month).padStart(2, '0')}`;
        } else {
            // Daily
            selectDate = `DATE(created_at) AS date`;
            groupBy = `date`;
            labelFormat = row => format(new Date(row.date), 'dd/MM');
        }
        const [rows] = await pool.execute(
            `SELECT ${selectDate}, COUNT(*) AS count
             FROM res_users
             WHERE DATE(created_at) BETWEEN ? AND ?
             GROUP BY ${groupBy}
             ORDER BY ${groupBy} ASC`,
            [startDate, endDate]
        );
        const data = rows.map(row => ({
            label: labelFormat(row),
            count: row.count
        }));
        const totalCount = rows.reduce((sum, row) => sum + (parseInt(row.count) || 0), 0);
        return res.status(200).json({ status: 'success', data, totalCount });
    } catch (error) {
        console.error('Error fetching chart data:', error);
        return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
}

async function getOrdersChartData(req, res) {
    try {
        const { startDate: queryStart, endDate: queryEnd, filter } = req.query;
        let startDate, endDate;
        if (isValidDate(queryStart) && isValidDate(queryEnd)) {
            startDate = queryStart;
            endDate = queryEnd;
        } else if (filter) {
            ({ startDate, endDate } = getDateRange(filter));
        } else {
            ({ startDate, endDate } = getDateRange('Last 7 days'));
        }
        const daysDiff = differenceInDays(new Date(endDate), new Date(startDate));
        let selectDate, groupBy, labelFormat;
        let newOrderCondition;
        if (daysDiff > 365) {
            // Yearly
            selectDate = `YEAR(created_at) AS year`;
            groupBy = `year`;
            labelFormat = row => `${row.year}`;
            newOrderCondition = `YEAR(fo.first_order) = YEAR(o.created_at)`;
        } else if (daysDiff > 30) {
            // Monthly
            selectDate = `YEAR(created_at) AS year, MONTH(created_at) AS month`;
            groupBy = `year, month`;
            labelFormat = row => `${String(row.year).slice(-2)}-${String(row.month).padStart(2, '0')}`;
            newOrderCondition = `YEAR(fo.first_order) = YEAR(o.created_at) AND MONTH(fo.first_order) = MONTH(o.created_at)`;
        } else {
            // Daily
            selectDate = `DATE(created_at) AS date`;
            groupBy = `date`;
            labelFormat = row => format(new Date(row.date), 'dd/MM');
            newOrderCondition = `DATE(fo.first_order) = DATE(o.created_at)`;
        }
        const baseCurrency = await getBaseCurrencyInfo();

        const [rows] = await pool.execute(
            `SELECT ${selectDate}, 
                    COUNT(*) as total_orders,
                    SUM(CASE WHEN order_status = 7 THEN 1 ELSE 0 END) as completed_orders,
                    SUM(CASE WHEN payment_status = 2 THEN 1 ELSE 0 END) as paid_orders,
                    SUM(total_amount / ${SAFE_EXCHANGE_RATE_EXPRESSION}) as total_amount_converted,
                    SUM(CASE WHEN payment_status = 2 THEN amount_paid / ${SAFE_EXCHANGE_RATE_EXPRESSION} ELSE 0 END) as paid_amount_converted
             FROM res_orders
             WHERE DATE(created_at) BETWEEN ? AND ?
             GROUP BY ${groupBy}
             ORDER BY ${groupBy} ASC`,
            [startDate, endDate]
        );
        const [newReturningRows] = await pool.execute(
            `SELECT ${selectDate},
                    SUM(CASE WHEN ${newOrderCondition} THEN 1 ELSE 0 END) AS new_orders,
                    COUNT(*) AS total_orders
             FROM res_orders o
             INNER JOIN (
                SELECT user_id, MIN(created_at) AS first_order
                FROM res_orders
                GROUP BY user_id
             ) fo ON fo.user_id = o.user_id
             WHERE DATE(o.created_at) BETWEEN ? AND ?
             GROUP BY ${groupBy}
             ORDER BY ${groupBy} ASC`,
            [startDate, endDate]
        );
        const newReturningMap = new Map();
        newReturningRows.forEach(row => {
            const key = labelFormat(row);
            const newOrders = parseInt(row.new_orders) || 0;
            const total = parseInt(row.total_orders) || 0;
            newReturningMap.set(key, {
                newOrders,
                returningOrders: Math.max(total - newOrders, 0),
            });
        });

        const data = rows.map(row => {
            const label = labelFormat(row);
            const mix = newReturningMap.get(label) || {
                newOrders: 0,
                returningOrders: parseInt(row.total_orders) || 0,
            };
            return {
                label,
                totalOrders: parseInt(row.total_orders) || 0,
                completedOrders: parseInt(row.completed_orders) || 0,
                paidOrders: parseInt(row.paid_orders) || 0,
                totalRevenue: parseFloat(row.total_amount_converted) || 0,
                paidRevenue: parseFloat(row.paid_amount_converted) || 0,
                newOrders: mix.newOrders,
                returningOrders: mix.returningOrders,
            };
        });
        const totalAmount = rows.reduce((sum, row) => sum + (parseFloat(row.total_amount_converted) || 0), 0);
        const paidAmount = rows.reduce((sum, row) => sum + (parseFloat(row.paid_amount_converted) || 0), 0);
        const totalOrders = rows.reduce((sum, row) => sum + (parseInt(row.total_orders) || 0), 0);
        const completedOrders = rows.reduce((sum, row) => sum + (parseInt(row.completed_orders) || 0), 0);
        const paidOrders = rows.reduce((sum, row) => sum + (parseInt(row.paid_orders) || 0), 0);
        const totalNewOrders = Array.from(newReturningMap.values()).reduce(
            (acc, mix) => acc + mix.newOrders,
            0,
        );
        
        const [currencyBreakdownRows] = await pool.execute(
            `SELECT 
                currency,
                SUM(amount_paid) as total_amount,
                SUM(amount_paid / ${SAFE_EXCHANGE_RATE_EXPRESSION}) as total_amount_converted
             FROM res_orders
             WHERE DATE(created_at) BETWEEN ? AND ?
             GROUP BY currency`,
            [startDate, endDate]
        );

        const currencyBreakdown = currencyBreakdownRows.map(row => ({
            currency: row.currency || baseCurrency.code,
            totalAmount: parseFloat(row.total_amount) || 0,
            totalAmountConverted: parseFloat(row.total_amount_converted) || 0
        }));

        return res.status(200).json({ 
            status: 'success', 
            data, 
            totalAmount, 
            paidAmount,
            totalOrders,
            completedOrders,
            paidOrders,
            newCustomerOrders: totalNewOrders,
            returningCustomerOrders: Math.max(totalOrders - totalNewOrders, 0),
            completionRate: totalOrders > 0 ? (completedOrders / totalOrders * 100).toFixed(2) : 0,
            paymentRate: totalOrders > 0 ? (paidOrders / totalOrders * 100).toFixed(2) : 0,
            currency: {
                code: baseCurrency.code,
                symbol: baseCurrency.symbol,
                breakdown: currencyBreakdown
            }
        });
    } catch (error) {
        console.error('Error fetching chart data:', error);
        return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
}

async function getFileDownloadsChartData(req, res) {
    try {
        const { startDate: queryStart, endDate: queryEnd, filter } = req.query;
        let startDate, endDate;
        if (isValidDate(queryStart) && isValidDate(queryEnd)) {
            startDate = queryStart;
            endDate = queryEnd;
        } else if (filter) {
            ({ startDate, endDate } = getDateRange(filter));
        } else {
            ({ startDate, endDate } = getDateRange('Last 7 days'));
        }

        const daysDiff = differenceInDays(new Date(endDate), new Date(startDate));
        let selectDate, groupBy, labelFormat;

        if (daysDiff > 365) {
            // Yearly aggregation
            selectDate = `YEAR(created_at) AS year`;
            groupBy = `year`;
            labelFormat = row => `${row.year}`;
        } else if (daysDiff > 90) {
            // Monthly aggregation
            selectDate = `YEAR(created_at) AS year, MONTH(created_at) AS month`;
            groupBy = `year, month`;
            labelFormat = row => `${String(row.month).padStart(2, '0')}/${String(row.year).slice(-2)}`;
        } else if (daysDiff > 30) {
            // Weekly aggregation (ISO week)
            selectDate = `YEAR(created_at) AS year, WEEK(created_at, 1) AS week`;
            groupBy = `year, week`;
            labelFormat = row => {
                const weekStart = getDateOfISOWeek(row.week, row.year);
                return format(weekStart, 'dd/MM');
            };
        } else {
            // Daily aggregation
            selectDate = `DATE(created_at) AS date`;
            groupBy = `date`;
            labelFormat = row => format(new Date(row.date), 'dd/MM');
        }

        const [rows] = await pool.execute(
            `SELECT ${selectDate}, COUNT(*) as downloads
             FROM res_udownloads
             WHERE DATE(created_at) BETWEEN ? AND ?
             GROUP BY ${groupBy}
             ORDER BY ${groupBy} ASC`,
            [startDate, endDate]
        );

        const data = rows.map(row => ({
            label: labelFormat(row),
            downloads: parseInt(row.downloads) || 0
        }));

        const [totalRow] = await pool.execute(
            `SELECT COUNT(*) as total_downloads
             FROM res_udownloads
             WHERE DATE(created_at) BETWEEN ? AND ?`,
            [startDate, endDate]
        );

        const totalDownloads = totalRow[0].total_downloads;

        return res.status(200).json({ 
            status: 'success', 
            data, 
            totalDownloads,
            dateRange: { startDate, endDate }
        });
    } catch (error) {
        console.error('Error fetching chart data:', error);
        return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
}

async function getTransactionsChartData(req, res) {
    try {
        const { startDate: queryStart, endDate: queryEnd, filter } = req.query;
        let startDate, endDate;
        if (isValidDate(queryStart) && isValidDate(queryEnd)) {
            startDate = queryStart;
            endDate = queryEnd;
        } else if (filter) {
            ({ startDate, endDate } = getDateRange(filter));
        } else {
            ({ startDate, endDate } = getDateRange('Last 7 days'));
        }

        const daysDiff = differenceInDays(new Date(endDate), new Date(startDate));
        let selectDate, groupBy, labelFormat;

        if (daysDiff > 365) {
            // Yearly
            selectDate = `YEAR(created_at) AS year`;
            groupBy = `year, payment_method`;
            labelFormat = row => `${row.year}`;
        } else if (daysDiff > 30) {
            // Monthly
            selectDate = `YEAR(created_at) AS year, MONTH(created_at) AS month`;
            groupBy = `year, month, payment_method`;
            labelFormat = row => `${String(row.year).slice(-2)}-${String(row.month).padStart(2, '0')}`;
        } else {
            // Daily
            selectDate = `DATE(created_at) AS date`;
            groupBy = `date, payment_method`;
            labelFormat = row => format(new Date(row.date), 'dd/MM');
        }

        const baseCurrency = await getBaseCurrencyInfo();

        const [rows] = await pool.execute(
            `SELECT ${selectDate}, 
                    payment_method,
                    SUM(CASE 
                        WHEN payment_method = 3 THEN CAST(amount AS DECIMAL(10,2))
                        ELSE CAST(amount AS DECIMAL(10,2)) / ${SAFE_EXCHANGE_RATE_EXPRESSION}
                    END) as total_amount,
                    COUNT(CASE WHEN payment_status = 2 THEN 1 END) as successful_transactions
             FROM res_transactions
             WHERE DATE(created_at) BETWEEN ? AND ?
             GROUP BY ${groupBy}
             ORDER BY ${groupBy} ASC`,
            [startDate, endDate]
        );

        // Process data for line chart
        const chartData = {
            labels: [], // Time periods (dates)
            datasets: [] // Payment method datasets
        };

        // Get unique payment methods
        const paymentMethods = [...new Set(rows.map(row => PAYMENT_METHOD[row.payment_method] || 'Unknown'))];
        
        // Initialize datasets for each payment method
        const datasets = paymentMethods.map(method => ({
            label: method,
            data: [],
            borderColor: getPaymentMethodColor(method),
            fill: false,
            tension: 0.4
        }));

        // Group data by date
        const groupedByDate = {};
        rows.forEach(row => {
            const label = labelFormat(row);
            const paymentMethod = PAYMENT_METHOD[row.payment_method] || 'Unknown';
            
            if (!groupedByDate[label]) {
                groupedByDate[label] = {};
            }
            groupedByDate[label][paymentMethod] = parseFloat(row.total_amount) || 0;
        });

        // Sort dates chronologically
        const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
            const dateA = new Date(a.split('/').reverse().join('-'));
            const dateB = new Date(b.split('/').reverse().join('-'));
            return dateA - dateB;
        });

        // Fill in the data
        chartData.labels = sortedDates;
        
        datasets.forEach(dataset => {
            sortedDates.forEach(date => {
                const amount = groupedByDate[date][dataset.label] || 0;
                dataset.data.push(amount);
            });
        });

        chartData.datasets = datasets;

        // Calculate summary statistics
        const summary = {
            totalAmount: rows.reduce((sum, row) => sum + (parseFloat(row.total_amount) || 0), 0),
            totalTransactions: rows.reduce((sum, row) => sum + (parseInt(row.successful_transactions) || 0), 0),
            paymentMethodTotals: paymentMethods.reduce((acc, method) => {
                const methodRows = rows.filter(row => (PAYMENT_METHOD[row.payment_method] || 'Unknown') === method);
                acc[method] = {
                    amount: methodRows.reduce((sum, row) => sum + (parseFloat(row.total_amount) || 0), 0),
                    transactions: methodRows.reduce((sum, row) => sum + (parseInt(row.successful_transactions) || 0), 0)
                };
                return acc;
            }, {})
        };

        const [currencyBreakdownRows] = await pool.execute(
            `SELECT 
                currency,
                SUM(amount) as total_amount,
                SUM(amount / ${SAFE_EXCHANGE_RATE_EXPRESSION}) as total_amount_converted
             FROM res_transactions
             WHERE DATE(created_at) BETWEEN ? AND ?
             GROUP BY currency`,
            [startDate, endDate]
        );

        const currencyBreakdown = currencyBreakdownRows.map(row => ({
            currency: row.currency || baseCurrency.code,
            totalAmount: parseFloat(row.total_amount) || 0,
            totalAmountConverted: parseFloat(row.total_amount_converted) || 0
        }));

        return res.status(200).json({
            status: 'success',
            chartData,
            summary,
            dateRange: { startDate, endDate },
            currency: {
                code: baseCurrency.code,
                symbol: baseCurrency.symbol,
                breakdown: currencyBreakdown
            }
        });
    } catch (error) {
        console.error('Error fetching transaction chart data:', error);
        return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
}

// Helper function to get consistent colors for payment methods
function getPaymentMethodColor(method) {
    const colors = {
        'Cashfree': '#6933d3',
        'Razorpay': '#4ECDC4',
        'Stripe': '#45B7D1',
        'PayPal': '#96CEB4',
        'Unknown': '#FFD93D'
    };
    return colors[method] || '#22c55f';
}

module.exports = {
    getUsersChartData,
    getOrdersChartData,
    getFileDownloadsChartData,
    getTransactionsChartData
};
