const { pool } = require("../../config/database");

async function getAgents(req, res) {
  try {
    const { search = "", country_code = "", agent_type= "" } = req.query;
    
    // Fetch agents with optional search
    const [agentRows] = await pool.query(
      `SELECT 
        ra.*,
        c.name as country_name,
        c.iso2 as country_code_iso
       FROM res_agents ra
       LEFT JOIN countries c ON ra.country_code COLLATE utf8mb4_unicode_ci = c.iso2 COLLATE utf8mb4_unicode_ci
       WHERE ra.status = 1
       AND (ra.name LIKE ? OR ra.email LIKE ? OR ra.phone LIKE ? OR ra.address LIKE ? OR ra.description LIKE ?)
       AND (? = '' OR ra.country_code = ?)
       AND (? = '' OR ra.agent_type = ?)
       ORDER BY ra.position`,
      [...Array(5).fill(`%${search}%`), country_code, country_code, agent_type, agent_type]
    );


    // Fetch all social links
    const [socialLinksRows] = await pool.query(
      `SELECT agent_id, platform, url FROM res_agent_social_links`
    );

    // Map social links to their respective agents
    const agentsWithSocialLinks = agentRows.map(agent => {
      const socialLinks = socialLinksRows.filter(
        link => link.agent_id === agent.agent_id
      );
      return { 
        ...agent, 
        social_links: socialLinks,
        country_name: agent.country_name || null,
        country_code_iso: agent.country_code_iso || null
      };
    });

    // Send response
    res.status(200).json({
      message: "Agents fetched successfully",
      status: "success",
      data: agentsWithSocialLinks,
    });
  } catch (err) {
    console.error("Error fetching agents:", err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

async function getAgentStats(req, res) {
  try {
    // Total agents
    const [totalAgents] = await pool.query('SELECT COUNT(*) as total FROM res_agents WHERE status = 1');

    // Total countries
    const [totalCountries] = await pool.query(`
      SELECT COUNT(DISTINCT ra.country_code) as total 
      FROM res_agents ra 
      WHERE ra.status = 1 AND ra.country_code IS NOT NULL AND ra.country_code != ''
    `);

    // Total resellers
    const [totalResellers] = await pool.query(`
      SELECT COUNT(*) as total 
      FROM res_agents 
      WHERE status = 1 AND agent_type = 'reseller'
    `);

    // Total distributors
    const [totalDistributors] = await pool.query(`
      SELECT COUNT(*) as total 
      FROM res_agents 
      WHERE status = 1 AND agent_type = 'distributor'
    `);

    const stats = {
      total_countries: totalCountries[0].total,
      total_agents: totalAgents[0].total,
      total_resellers: totalResellers[0].total,
      total_distributors: totalDistributors[0].total
    };

    res.status(200).json({
      message: "Agent statistics fetched successfully",
      status: "success",
      data: stats,
    });
  } catch (err) {
//     // console.error("Error fetching agent statistics:", err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

async function getCountries(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT ra.country_code COLLATE utf8mb4_unicode_ci AS country_code, c.name, c.emoji 
       FROM res_agents ra
       LEFT JOIN countries c ON ra.country_code COLLATE utf8mb4_unicode_ci = c.iso2 COLLATE utf8mb4_unicode_ci
       WHERE ra.status = 1`
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "No countries found",
        status: "error",
      });
    }

    res.status(200).json({
      message: "Countries fetched successfully",
      status: "success",
      data: rows,
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}


module.exports = {
  getAgents,
  getAgentStats,
  getCountries,
};
