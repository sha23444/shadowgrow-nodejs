const { pool } = require("../../config/database");

// Create a new team member
async function createTeamMember(req, res) {
  const connection = await pool.getConnection(); // Use transactions
  try {
    const { name, designation, email, photo, phone, gender, bio, address, country, video, skills = [], social_links = [], status = true } = req.body;

    // Validation
    if (!name || !designation || !email) {
      return res.status(400).json({
        message: "Name, designation, and email are required",
        status: "error",
        errors: ["name", "designation", "email"]
      });
    }

    // Start transaction
    await connection.beginTransaction();

    // Get the current maximum position
    const [positionResult] = await connection.query(
      `SELECT IFNULL(MAX(position) + 1, 1) AS nextPosition FROM res_team`
    );
    const nextPosition = positionResult[0].nextPosition;

    // Insert team member
    const [result] = await connection.query(
      `INSERT INTO res_team (name, designation, email, photo, phone, gender, bio, address, country, video, skills, status, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, designation, email, photo, phone, gender, bio, address, country, video, JSON.stringify(skills), status, nextPosition]
    );

    const teamId = result.insertId;

    // Insert social links
    if (social_links.length > 0) {
      const socialLinkQueries = social_links.map(({ platform, url }) =>
        connection.query(
          `INSERT INTO res_team_social_links (team_id, platform, url) VALUES (?, ?, ?)`,
          [teamId, platform, url]
        )
      );
      await Promise.all(socialLinkQueries);
    }

    // Commit transaction
    await connection.commit();

    res.status(201).json({
      message: "Team member created successfully",        
      status: "success",
      data: { team_id: teamId }
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

// Get all team members with search, filtering, and sorting
async function getTeamMembers(req, res) {
  try {
    const {
      search = "",
      designation = "",
      status = "",
      skills = "",
      sort = "position",
      order = "asc"
    } = req.query;

    const validSortFields = ["name", "designation", "position", "created_at", "email"];
    const validOrders = ["asc", "desc"];
    
    const sortField = validSortFields.includes(sort) ? sort : "position";
    const sortOrder = validOrders.includes(order.toLowerCase()) ? order.toUpperCase() : "ASC";

    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];

    if (search) {
      whereConditions.push(`(name LIKE ? OR email LIKE ? OR designation LIKE ? OR JSON_SEARCH(skills, 'one', ?) IS NOT NULL)`);
      const searchParam = `%${search}%`;
      queryParams.push(searchParam, searchParam, searchParam, search);
    }

    if (designation) {
      whereConditions.push(`designation = ?`);
      queryParams.push(designation);
    }

    if (status !== "") {
      whereConditions.push(`status = ?`);
      queryParams.push(status === "true" ? 1 : 0);
    }

    if (skills) {
      whereConditions.push(`JSON_CONTAINS(skills, ?)`);
      queryParams.push(JSON.stringify(skills));
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    // Get team members
    const [teamRows] = await pool.query(
      `SELECT 
        t.*,
        c.name as country_name,
        c.iso2 as country_code
      FROM res_team t
      LEFT JOIN countries c ON t.country COLLATE utf8mb4_unicode_ci = c.iso2 COLLATE utf8mb4_unicode_ci
      ${whereClause} ORDER BY ${sortField} ${sortOrder}`,
      queryParams
    );

    if (!teamRows.length) {
      return res.status(200).json({
        message: "No team members found",
        status: "success",
        data: []
      });
    }

    // Fetch social links for all team members
    const teamIds = teamRows.map(team => team.team_id);
    const [socialLinksRows] = await pool.query(
      `SELECT team_id, platform, url FROM res_team_social_links WHERE team_id IN (${teamIds.map(() => "?").join(",")})`,
      teamIds
    );

    // Map social links to their respective team members
    const teamsWithSocialLinks = teamRows.map(team => {
      const socialLinks = socialLinksRows.filter(
        link => link.team_id === team.team_id
      );
      
      // Parse skills field
      let skillsArray = [];
      if (team.skills) {
        try {
          skillsArray = JSON.parse(team.skills);
        } catch (parseError) {
          console.error("Error parsing skills JSON:", parseError);
        }
      }
      
      return { 
        ...team, 
        social_links: socialLinks,
        skills: skillsArray,
        country: team.country || null,
        country_name: team.country_name || null,
        country_code: team.country_code || null
      };
    });

    // Send response
    res.status(200).json({
      message: "Teams fetched successfully",
      status: "success",
      data: teamsWithSocialLinks
    });

  } catch (err) {
    console.error("Error fetching team members:", err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

// Get a specific team member
async function getTeamMember(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT 
        t.*,
        c.name as country_name,
        c.iso2 as country_code
      FROM res_team t
      LEFT JOIN countries c ON t.country COLLATE utf8mb4_unicode_ci = c.iso2 COLLATE utf8mb4_unicode_ci
      WHERE t.team_id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Team member not found",
        status: "error",
      });
    }

    // Get social links for this team member
    const [socialLinksRows] = await pool.query(
      "SELECT team_id, platform, url FROM res_team_social_links WHERE team_id = ?",
      [id]
    );

    // Parse skills field
    let skillsArray = [];
    if (rows[0].skills) {
      try {
        skillsArray = JSON.parse(rows[0].skills);
      } catch (parseError) {
        console.error("Error parsing skills JSON:", parseError);
      }
    }

    const teamMember = { 
      ...rows[0], 
      social_links: socialLinksRows,
      skills: skillsArray,
      country: rows[0].country || null,
      country_name: rows[0].country_name || null,
      country_code: rows[0].country_code || null
    };

    res.status(200).json({
      message: "Team member fetched successfully",
      data: teamMember,
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

// Update a team member
async function updateTeamMember(req, res) {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { 
      name, 
      designation, 
      email, 
      photo, 
      phone, 
      gender, 
      bio, 
      address, 
      country, 
      video,
      skills,
      social_links = [], 
      status 
    } = req.body;

    // Check if team member exists
    const [existingMember] = await connection.query(
      "SELECT team_id FROM res_team WHERE team_id = ?",
      [id]
    );

    if (existingMember.length === 0) {
      return res.status(404).json({
        message: "Team member not found",
        status: "error",
      });
    }

    // Validation
    if (!name || !designation || !email) {
      return res.status(400).json({
        message: "Name, designation, and email are required",
        status: "error",
        errors: ["name", "designation", "email"]
      });
    }

    // Start transaction
    await connection.beginTransaction();

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      updateFields.push("name = ?");
      updateValues.push(name);
    }
    if (designation !== undefined) {
      updateFields.push("designation = ?");
      updateValues.push(designation);
    }
    if (email !== undefined) {
      updateFields.push("email = ?");
      updateValues.push(email);
    }
    if (photo !== undefined) {
      updateFields.push("photo = ?");
      updateValues.push(photo);
    }
    if (phone !== undefined) {
      updateFields.push("phone = ?");
      updateValues.push(phone);
    }
    if (gender !== undefined) {
      updateFields.push("gender = ?");
      updateValues.push(gender);
    }
    if (bio !== undefined) {
      updateFields.push("bio = ?");
      updateValues.push(bio);
    }
    if (address !== undefined) {
      updateFields.push("address = ?");
      updateValues.push(address);
    }
    if (country !== undefined) {
      updateFields.push("country = ?");
      updateValues.push(country);
    }
    if (video !== undefined) {
      updateFields.push("video = ?");
      updateValues.push(video);
    }
    if (skills !== undefined) {
      updateFields.push("skills = ?");
      updateValues.push(JSON.stringify(skills));
    }
    if (status !== undefined) {
      updateFields.push("status = ?");
      updateValues.push(status);
    }

    // Update team member if there are fields to update
    if (updateFields.length > 0) {
      updateValues.push(id);
      await connection.query(
        `UPDATE res_team SET ${updateFields.join(", ")} WHERE team_id = ?`,
        updateValues
      );
    }

    // Update social links if provided
    if (social_links.length > 0) {
      // Delete existing social links
      await connection.query(
        "DELETE FROM res_team_social_links WHERE team_id = ?",
        [id]
      );

      // Insert new social links
      const socialLinkQueries = social_links.map(({ platform, url }) =>
        connection.query(
          `INSERT INTO res_team_social_links (team_id, platform, url) VALUES (?, ?, ?)`,
          [id, platform, url]
        )
      );
      await Promise.all(socialLinkQueries);
    }

    // Commit transaction
    await connection.commit();

    res.status(200).json({
      message: "Team member updated successfully",
      status: "success",
      data: { team_id: id }
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

// Delete a team member and update positions
async function deleteTeamMember(req, res) {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;

    // Start transaction
    await connection.beginTransaction();

    // Get the position of the team member being deleted
    const [rows] = await connection.query(
      "SELECT position FROM res_team WHERE team_id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Team member not found",
        status: "error",
      });
    }

    const deletedPosition = rows[0].position;

    // Delete the team member (social links will be deleted automatically due to CASCADE)
    await connection.query("DELETE FROM res_team WHERE team_id = ?", [id]);

    // Update positions of the remaining team members
    await connection.query(
      "UPDATE res_team SET position = position - 1 WHERE position > ?",
      [deletedPosition]
    );

    // Commit transaction
    await connection.commit();

    res.status(200).json({
      message: "Team member deleted successfully",
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

// Bulk position updates for drag-and-drop reordering
async function updateTeamPositions(req, res) {
  const connection = await pool.getConnection();
  try {
    const { positions } = req.body;

    console.log("Received positions:", positions); // Debug log

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

    // Validate that all team IDs exist - convert strings to integers
    const teamIds = positions.map(p => parseInt(p.id));
    console.log("Parsed team IDs:", teamIds); // Debug log
    
    // Check for invalid IDs
    if (teamIds.some(id => isNaN(id) || id <= 0)) {
      return res.status(400).json({
        message: "Invalid team ID provided",
        status: "error",
      });
    }

    // First, let's check what's in the database
    const [allTeams] = await connection.query(
      "SELECT team_id FROM res_team ORDER BY team_id"
    );
    console.log("All team IDs in database:", allTeams.map(t => t.team_id)); // Debug log

    const [existingTeams] = await connection.query(
      `SELECT team_id FROM res_team WHERE team_id IN (${teamIds.map(() => "?").join(",")})`,
      teamIds
    );

    console.log("Found teams:", existingTeams); // Debug log
    console.log("Expected count:", teamIds.length, "Found count:", existingTeams.length); // Debug log

    if (existingTeams.length !== teamIds.length) {
      // Find which IDs are missing
      const existingIds = existingTeams.map(team => team.team_id);
      const missingIds = teamIds.filter(id => !existingIds.includes(id));
      
      console.log("Missing IDs:", missingIds); // Debug log
      
      return res.status(400).json({
        message: "One or more team members not found",
        status: "error",
        data: {
          missing_ids: missingIds,
          provided_ids: teamIds,
          found_ids: existingIds,
          all_available_ids: allTeams.map(t => t.team_id)
        }
      });
    }

    // Update positions - use the parsed integer IDs
    const updateQueries = positions.map(({ id, position }) =>
      connection.query(
        `UPDATE res_team SET position = ? WHERE team_id = ?`,
        [position, parseInt(id)]
      )
    );

    await Promise.all(updateQueries);

    // Commit transaction
    await connection.commit();

    res.status(200).json({
      message: "Team positions updated successfully",
      status: "success",
      data: {
        updated_positions: positions.length
      }
    });
  } catch (err) {
    await connection.rollback();
    console.error("Error updating team positions:", err);
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


// Bulk operations
async function bulkTeamActions(req, res) {
  const connection = await pool.getConnection();
  try {
    const { action, ids, data = {} } = req.body;

    if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        message: "Action and IDs array are required",
        status: "error",
      });
    }

    const validActions = ["delete", "activate", "deactivate", "update"];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        message: "Invalid action. Valid actions: delete, activate, deactivate, update",
        status: "error",
      });
    }

    // Start transaction
    await connection.beginTransaction();

    let processed = 0;
    let failed = 0;
    const errors = [];

    // Validate that all team IDs exist
    const [existingTeams] = await connection.query(
      `SELECT team_id FROM res_team WHERE team_id IN (${ids.map(() => "?").join(",")})`,
      ids
    );

    if (existingTeams.length !== ids.length) {
      return res.status(400).json({
        message: "One or more team members not found",
        status: "error",
      });
    }

    try {
      switch (action) {
        case "delete":
          // Get positions of team members to be deleted
          const [positionsToDelete] = await connection.query(
            `SELECT team_id, position FROM res_team WHERE team_id IN (${ids.map(() => "?").join(",")}) ORDER BY position DESC`,
            ids
          );

          // Delete team members
          await connection.query(
            `DELETE FROM res_team WHERE team_id IN (${ids.map(() => "?").join(",")})`,
            ids
          );

          // Update positions of remaining team members
          for (const { position } of positionsToDelete) {
            await connection.query(
              "UPDATE res_team SET position = position - 1 WHERE position > ?",
              [position]
            );
          }
          processed = ids.length;
          break;

        case "activate":
          await connection.query(
            `UPDATE res_team SET status = 1 WHERE team_id IN (${ids.map(() => "?").join(",")})`,
            ids
          );
          processed = ids.length;
          break;

        case "deactivate":
          await connection.query(
            `UPDATE res_team SET status = 0 WHERE team_id IN (${ids.map(() => "?").join(",")})`,
            ids
          );
          processed = ids.length;
          break;

        case "update":
          const updateFields = [];
          const updateValues = [];
          
          Object.keys(data).forEach(key => {
            if (["name", "designation", "email", "photo", "phone", "gender", "bio", "address", "country", "video", "skills"].includes(key)) {
              updateFields.push(`${key} = ?`);
              updateValues.push(key === "skills" ? JSON.stringify(data[key]) : data[key]);
            }
          });

          if (updateFields.length > 0) {
            await connection.query(
              `UPDATE res_team SET ${updateFields.join(", ")} WHERE team_id IN (${ids.map(() => "?").join(",")})`,
              [...updateValues, ...ids]
            );
            processed = ids.length;
          }
          break;
      }

      await connection.commit();

      res.status(200).json({
        message: "Bulk operation completed successfully",
        status: "success",
        data: {
          processed,
          failed,
          errors
        }
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    }
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

// Team analytics
async function getTeamAnalytics(req, res) {
  try {
    // Get total members
    const [totalResult] = await pool.query(`SELECT COUNT(*) as total FROM res_team`);
    const totalMembers = totalResult[0].total;

    // Get active/inactive members
    const [statusResult] = await pool.query(`
      SELECT 
        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as active_members,
        SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as inactive_members
      FROM res_team
    `);
    const { active_members, inactive_members } = statusResult[0];

    // Get designation distribution
    const [designationResult] = await pool.query(`
      SELECT designation, COUNT(*) as count 
      FROM res_team 
      GROUP BY designation 
      ORDER BY count DESC
    `);

    // Get skills distribution
    const [skillsResult] = await pool.query(`
      SELECT 
        JSON_UNQUOTE(JSON_EXTRACT(skill, '$')) as skill_name,
        COUNT(*) as count
      FROM res_team 
      CROSS JOIN JSON_TABLE(
        skills, 
        '$[*]' COLUMNS (skill VARCHAR(255) PATH '$')
      ) as skills_table
      WHERE skills IS NOT NULL AND JSON_LENGTH(skills) > 0
      GROUP BY skill_name 
      ORDER BY count DESC
    `);

    // Get recent additions (last 5)
    const [recentResult] = await pool.query(`
      SELECT name, designation, created_at as joined_date
      FROM res_team 
      ORDER BY created_at DESC 
      LIMIT 5
    `);

    // Calculate growth rate (members added in last 30 days)
    const [growthResult] = await pool.query(`
      SELECT COUNT(*) as recent_count
      FROM res_team 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);
    const growthRate = totalMembers > 0 ? ((growthResult[0].recent_count / totalMembers) * 100).toFixed(1) : 0;

    res.status(200).json({
      message: "Analytics fetched successfully",
      status: "success",
      data: {
        total_members: totalMembers,
        active_members: active_members,
        inactive_members: inactive_members,
        designations: designationResult.reduce((acc, item) => {
          acc[item.designation] = item.count;
          return acc;
        }, {}),
        skills: skillsResult.reduce((acc, item) => {
          acc[item.skill_name] = item.count;
          return acc;
        }, {}),
        recent_additions: recentResult,
        growth_rate: parseFloat(growthRate)
      }
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
  createTeamMember,
  getTeamMembers,
  getTeamMember,
  updateTeamMember,
  deleteTeamMember,
  updateTeamPositions,
  bulkTeamActions,
  getTeamAnalytics,
};
