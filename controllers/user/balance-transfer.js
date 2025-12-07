const { pool } = require("../../config/database");

async function balanceTransfer(req, res) {
    const connection = await pool.getConnection(); 
    try {
        const { username, amount, receiver_email } = req.body;

        await connection.beginTransaction();

        // Get sender details (Indexing speeds this up)
        const [users] = await connection.query(
            `SELECT user_id, balance FROM res_users WHERE username = ? LIMIT 1`, 
            [username]
        );
        if (users.length === 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "User not found" });
        }
        const user = users[0];


        if (+user.balance < +amount) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "Insufficient balance" });
        }

        // Get receiver details (Indexing speeds this up)
        const [receivers] = await connection.query(
            `SELECT user_id, username FROM res_users WHERE username = ? OR email = ? LIMIT 1`, 
            [receiver_email, receiver_email]
        );
        if (receivers.length === 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "Receiver not found" });
        }
        const receiver = receivers[0];

        // Optimized Single Query for Balance Update
        await connection.query(
            `UPDATE res_users 
            SET balance = CASE 
                WHEN user_id = ? THEN balance - ? 
                WHEN user_id = ? THEN balance + ? 
            END
            WHERE user_id IN (?, ?)`,
            [user.user_id, amount, receiver.user_id, amount, user.user_id, receiver.user_id]
        );

        // Optimized Batch Insert for Transactions
        await connection.query(
            `INSERT INTO res_transfers (user_id, amount, type, notes) VALUES 
            (?, ?, "debit", ?), 
            (?, ?, "credit", ?)`,
            [user.user_id, amount, `Transfer to ${receiver.username}`, receiver.user_id, amount, `Transfer from ${username}`]
        );

        const message = `Balance Transfer s`;

        await connection.commit(); 

        return res.json({ success: true, message: `Balance Transfer Successful  ` });
    } catch (error) {
        await connection.rollback(); 
        return res.status(500).json({ success: false, message: "Server Error", error: error.message });
    } finally {
        connection.release(); 
    }
}

module.exports = { balanceTransfer };