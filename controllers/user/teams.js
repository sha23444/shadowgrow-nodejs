const { pool } = require("../../config/database");


async function getTeamMembers(req, res) {
    try {
        const [rows] = await pool.query(`
            SELECT 
                t.*,
                c.name as country_name,
                c.iso2 as country_code
            FROM res_team t
            LEFT JOIN countries c ON t.country COLLATE utf8mb4_unicode_ci = c.iso2 COLLATE utf8mb4_unicode_ci
            ORDER BY t.position ASC
        `);

        if (!rows.length) {
            return res.status(200).json({
                message: "No team members found",
                data: [],
                status: "success",
            });
        }

        // Get team IDs to fetch social links
        const teamIds = rows.map(member => member.team_id);

        // Fetch social links for all team members
        const [socialLinksRows] = await pool.query(
            `SELECT team_id, platform, url FROM res_team_social_links WHERE team_id IN (${teamIds.map(() => "?").join(",")})`,
            teamIds
        );

        // Map through the rows and format social_links and skills as arrays
        const teamMembers = rows.map(member => {
            let skillsArray = [];

            // Handle skills
            if (member.skills) {
                try {
                    skillsArray = JSON.parse(member.skills);
                } catch (parseError) {
                    console.error("Error parsing skills JSON:", parseError);
                }
            }

            // Get social links for this team member
            const socialLinks = socialLinksRows.filter(
                link => link.team_id === member.team_id
            );

            return {
                team_id: member.team_id,
                name: member.name,
                designation: member.designation,
                email: member.email,
                photo: member.photo,
                phone: member.phone,
                gender: member.gender,
                bio: member.bio,
                address: member.address,
                country: member.country || null,
                country_name: member.country_name || null,
                country_code: member.country_code || null,
                video: member.video,
                skills: skillsArray,
                social_links: socialLinks,
                status: member.status,
                position: member.position,
                created_at: member.created_at
            };
        });

        res.status(200).json({
            message: "Team members fetched successfully",
            data: teamMembers,
            status: "success",
        });
    } catch (err) {
        //         // console.error(err);
        res.status(500).json({
            message: "Internal server error",
            status: "error",
        });
    }
}

module.exports = {
    getTeamMembers,
};
