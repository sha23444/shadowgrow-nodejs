const { pool } = require("../../config/database");
const { ErrorLogger } = require("../../logger");
const NotificationService = require("../../services/notificationService");
const { notifyContactUsEnquiry } = require("../admin/telegram");

async function contactUsEnquiry(req, res) {
    try {
        const { name, email, phone, subject, message, user_id = null } = req.body;

        // table res_contact_enquiries
        const query = `
            INSERT INTO res_contact_enquiries (name, email, phone, subject, message, user_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        const [insertResult] = await pool.query(query, [name, email, phone, subject, message, user_id]);

        // send notification to admin
        setImmediate(() => {
            NotificationService.createNotification(
                "contact_us_enquiry_created",
                "Contact Us Enquiry Created",
                `Contact us enquiry has been created by user ${name}`,
                { contact_us_enquiry_id: insertResult.insertId }
            ).catch(error => {
                console.error('Error creating contact enquiry notification:', error);
            });
        });

        // Send Telegram notification to subscribed bots (non-blocking)
        // Get user_id from authenticated user or request body
        const userId = req.user?.id || user_id || null;
        setImmediate(() => {
            notifyContactUsEnquiry({
                name,
                email,
                phone,
                subject,
                message,
                user_id: userId
            }).catch(telegramError => {
                console.error('Error sending Telegram notification for contact enquiry:', telegramError);
            });
        });

        res.status(201).json({
//             message: "Your message has been submitted successfully and we will get back to you shortly",
//             status: "success",
        });
    } catch (err) {
        // send error log to error logger
        await ErrorLogger.logError({
//           errorType: 'contact_enquiry',
//           errorLevel: 'error',
//           errorMessage: err.message,
//           errorDetails: err,
//           userId: req.body.user_id,
//           endpoint: '/contactUsEnquiry'
        });
        res.status(500).json({
//             message: "Internal server error",
//             status: "error",
        });
    }
}


module.exports = {
    contactUsEnquiry,
};