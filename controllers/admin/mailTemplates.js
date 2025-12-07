const { pool } = require("../../config/database");

async function getSystemTemplates(req, res) {
  try {
    const [templates] = await pool.query(`
            SELECT * FROM res_mail_templates where is_system = 1
        `);

    res.status(200).json({
      data: templates,
      status: "success",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

async function getPartialTemplates(req, res) {
  try {
    const [templates] = await pool.query(`SELECT * FROM res_mail_partials`);

    res.status(200).json({
      data: templates,
      status: "success",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

async function getCustomTemplates(req, res) {
  try {
    const [templates] = await pool.query(`
            SELECT * FROM res_mail_templates where is_system = 0
        `);

    res.status(200).json({
      data: templates,
      status: "success",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

async function addCustomTemplate(req, res) {
  const connection = await pool.getConnection();
  try {
    const { title, subject, body, is_system = 1, stat } = req.body;

    await connection.query(
      `INSERT INTO res_mail_templates (title, subject, body, is_system) VALUES (?, ?, ?, ?)`,
      [title, subject, body, is_system]
    );

    res.status(200).json({
      message: "Template added successfully",
      status: "success",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  } finally {
    connection.release();
  }
}

async function updateTemplates(req, res) {
  const connection = await pool.getConnection();
  try {
    const { templateId } = req.params;

    const { title, subject, body, is_active, template_type } = req.body;

    if (!templateId) {
      return res.status(400).json({
        message: "Template id is required",
        status: "error",
      });
    }

    if (!template_type) {
      return res.status(400).json({
        message: "Template type is required",
        status: "error",
      });
    }

    if (template_type === "system") {
      await connection.query(
        `UPDATE res_mail_templates SET title = ?, subject = ?, body = ? WHERE template_id = ? AND is_system = 1`,
        [title, subject, body, is_active, templateId]
      );
    } else if (template_type === "custom") {
      await connection.query(
        `UPDATE res_mail_templates SET title = ?, subject = ?, body = ? WHERE template_id = ? AND is_system = 0`,
        [title, subject, body, is_active, templateId]
      );
    } else if (template_type === "partial") {
      await connection.query(
        `UPDATE res_mail_partials SET title = ?, subject = ?, body = ? WHERE partial_id = ?`,
        [title, subject, body, templateId]
      );
    }

    res.status(200).json({
      message: "Template updated successfully",
      status: "success",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  } finally {
    connection.release();
  }
}
async function getTemplateDetails(req, res) {
  try {
    const { template_type, template_id } = req.query;

    // Early return for missing parameters
    if (!template_id || !template_type) {
      return res.status(400).json({
        message: "Template type and template ID are required",
        status: "error",
      });
    }

    // Define SQL query based on template type
    let query, params;

    // Adjusted for consistent naming: template_id used in the query
    if (template_type === "system" || template_type === "custom") {
      query = `SELECT * FROM res_mail_templates WHERE template_id = ?`;
      params = [template_id];
    } else if (template_type === "partial") {
      query = `SELECT * FROM res_mail_partials WHERE template_id = ?`; // Assuming `template_id` is the column for partials
      params = [template_id];
    } else {
      return res.status(400).json({
        message: "Invalid template type provided",
        status: "error",
      });
    }

    // Execute query based on template type
    const [template] = await pool.query(query, params);

    // Handle case when template is not found
    if (!template || template.length === 0) {
      return res.status(404).json({
        message: "Template not found",
        status: "error",
      });
    }

    // Return the template data if found
    res.status(200).json({
      data: template[0], // Assuming the response is an array and we need the first item
      status: "success",
    });
  } catch (err) {
    console.error(err); // Log the error for debugging purposes
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}


async function deleteTemplates(req, res) {
  try {
    const { templateId } = req.params;

    // check if template is not system template is_system = 1
    const [template] = await pool.query(
      `SELECT * FROM res_mail_templates WHERE template_id = ?`,
      [templateId]
    );

    if (template[0].is_system === 1) {
      return res.status(400).json({
        message: "You can't delete system template",
        status: "error",
      });
    }

    await pool.query(`DELETE FROM res_mail_templates  WHERE template_id = ?`, [
      templateId,
    ]);
    res.status(200).json({
      message: "Template deleted successfully",
      status: "success",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

module.exports = {
  getSystemTemplates,
  getPartialTemplates,
  getCustomTemplates,
  addCustomTemplate,
  updateTemplates,
  deleteTemplates,
  getTemplateDetails,
};
