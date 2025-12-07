const { pool } = require("../../config/database");

/// Add a new agent with social links and position
async function addAgent(req, res) {
  const connection = await pool.getConnection(); // Use transactions
  try {
    const {
      name,
      email,
      phone,
      whatsapp,
      address,
      country_code,
      website,
      telegram,
      description,
      logo,
      status = 1,
      social_links = [],
    } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "Name, phone are required fields",
        status: "error",
      });
    }

    // Start transaction
    await connection.beginTransaction();

    const [[{ total: totalAgents }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM res_agents`
    );

    const position = totalAgents + 1;

    // Insert the agent details
    const [result] = await connection.query(
      `INSERT INTO res_agents (name, email, phone, whatsapp, address, country_code, website, telegram, description, logo, status, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        email,
        phone,
        whatsapp,
        address,
        country_code,
        website,
        telegram,
        description,
        logo,
        status,
        position,
      ]
    );

    const agentId = result.insertId;

    // Insert the social links
    const socialLinkQueries = social_links.map(({ platform, url }) =>
      connection.query(
        `INSERT INTO res_agent_social_links (agent_id, platform, url) VALUES (?, ?, ?)`,
        [agentId, platform, url]
      )
    );

    await Promise.all(socialLinkQueries);

    // Commit transaction
    await connection.commit();

    res.status(201).json({
      message: "Agent created successfully",
      status: "success",
    });
  } catch (err) {
    await connection.rollback(); // Rollback transaction on error
    console.error(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  } finally {
    connection.release();
  }
}

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
       WHERE (ra.name LIKE ? OR ra.email LIKE ? OR ra.phone LIKE ? OR ra.address LIKE ? OR ra.description LIKE ?)
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
    });
  }
}

async function updateAgent(req, res) {
  const connection = await pool.getConnection();
  const agent_id = req.params.id;

  try {
    const {
      name,
      email,
      phone,
      whatsapp,
      address,
      country_code,
      website,
      telegram,
      description,
      logo,
      status = 1,
      social_links = [],
      agent_type
    } = req.body;

    if ( !name) {
      return res.status(400).json({
        message: "agent_id, name, and phone are required fields",
        status: "error",
      });
    }

    // Start transaction
    await connection.beginTransaction();

    // Update agent
    await connection.query(
      `UPDATE res_agents SET name = ?, email = ?, phone = ?, whatsapp = ?, address = ?, country_code = ?, website = ?, telegram = ?, description = ?, logo = ?, status = ?, agent_type = ? WHERE agent_id = ?`,
      [
        name,
        email,
        phone,
        whatsapp,
        address,
        country_code,
        website,
        telegram,
        description,
        logo,
        status,
        agent_type,
        agent_id,
      ]
    );

    // Delete old social links
    await connection.query(
      `DELETE FROM res_agent_social_links WHERE agent_id = ?`,
      [agent_id]
    );

    // Insert new social links
    const socialLinkQueries = social_links.map(({ platform, url }) =>
      connection.query(
        `INSERT INTO res_agent_social_links (agent_id, platform, url) VALUES (?, ?, ?)`,
        [agent_id, platform, url]
      )
    );

    await Promise.all(socialLinkQueries);

    // Commit transaction
    await connection.commit();

    res.status(200).json({
      message: "Agent updated successfully",
      status: "success",
    });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  } finally {
    connection.release();
  }
}

// Delete an agent
async function deleteAgent(req, res) {
  try {
    const { id } = req.params;

    const query = `
            DELETE FROM res_agents
            WHERE agent_id = ?
        `;
    await pool.query(query, [id]);

    res.status(200).json({
      message: "Agent deleted successfully",
      status: "success",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}


async function reorderAgentPosition(req, res) {
  const connection = await pool.getConnection();
  try {
    const { positions } = req.body;


    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      return res.status(400).json({
        message: "Positions array is required",
        status: "error",
      });
    }

    // Validate positions array
    const positionNumbers = positions.map(p => p.position);
    const uniquePositions = new Set(positionNumbers);
    if (uniquePositions.size !== positionNumbers.length) {
      return res.status(400).json({
        message: "Position numbers must be unique",
        status: "error",
      });
    }

    // Start transaction
    await connection.beginTransaction();

    // Validate that all agent IDs exist - convert strings to integers
    const agentIds = positions.map(p => parseInt(p.id));
    
    // Check for invalid IDs
    if (agentIds.some(id => isNaN(id) || id <= 0)) {
      return res.status(400).json({
        message: "Invalid agent ID provided",
        status: "error",
      });
    }

    // First, let's check what's in the database
    const [allAgents] = await connection.query(
      "SELECT agent_id FROM res_agents ORDER BY agent_id"
    );

    const [existingAgents] = await connection.query(
      `SELECT agent_id FROM res_agents WHERE agent_id IN (${agentIds.map(() => "?").join(",")})`,
      agentIds
    );


    if (existingAgents.length !== agentIds.length) {
      // Find which IDs are missing
      const existingIds = existingAgents.map(agent => agent.agent_id);
      const missingIds = agentIds.filter(id => !existingIds.includes(id));
            
      return res.status(400).json({
        message: "One or more agents not found",
        status: "error",
        data: {
          missing_ids: missingIds,
          provided_ids: agentIds,
          found_ids: existingIds,
          all_available_ids: allAgents.map(a => a.agent_id)
        }
      });
    }

    // Update positions - use the parsed integer IDs
    const updateQueries = positions.map(({ id, position }) =>
      connection.query(
        `UPDATE res_agents SET position = ? WHERE agent_id = ?`,
        [position, parseInt(id)]
      )
    );

    await Promise.all(updateQueries);

    // Commit transaction
    await connection.commit();

    res.status(200).json({
      message: "Agent positions updated successfully",
      status: "success",
      data: {
        updated_positions: positions.length
      }
    });
  } catch (err) {
    await connection.rollback();
    console.error("Error updating agent positions:", err);
    console.error("Error details:", {
      message: err.message,
      code: err.code,
      sqlState: err.sqlState,
      sqlMessage: err.sqlMessage
    });
    res.status(500).json({
      message: "Internal server error",
      status: "error",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    connection.release();
  }
}

// get countries list of which agents are available

async function getCountries(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT ra.country_code COLLATE utf8mb4_unicode_ci AS country_code, c.name, c.emoji 
       FROM res_agents ra
       LEFT JOIN countries c ON ra.country_code COLLATE utf8mb4_unicode_ci = c.iso2 COLLATE utf8mb4_unicode_ci`
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
    console.error(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}


module.exports = {
  addAgent,
  getAgents,
  updateAgent,
  deleteAgent,
  reorderAgentPosition,
  getCountries,
};
