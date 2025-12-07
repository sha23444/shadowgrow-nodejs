const fs = require("fs").promises;
const path = require("path");
const Handlebars = require("handlebars");
const { pool } = require("../config/database.js");

const nodemailer = require("nodemailer");

function hslToHex(hsl) {
  // Handle both formats: "hsl(210, 100%, 56%)" and "217, 91%, 60%"
  let h, s, l;
  
  if (hsl.includes('hsl(')) {
    // Match hsl or hsla: hsl(210, 100%, 56%) or hsla(210, 100%, 56%, 1)
    const hslRegex = /hsla?\(\s*(\d+),\s*([\d.]+)%,\s*([\d.]+)%/i;
    const result = hslRegex.exec(hsl);
    if (!result) return hsl; // Not HSL, return as-is
    
    h = parseInt(result[1], 10);
    s = parseFloat(result[2]) / 100;
    l = parseFloat(result[3]) / 100;
  } else {
    // Handle comma-separated format: "217, 91%, 60%"
    const parts = hsl.split(',').map(part => part.trim());
    if (parts.length !== 3) return hsl; // Invalid format, return as-is
    
    h = parseInt(parts[0], 10);
    s = parseFloat(parts[1].replace('%', '')) / 100;
    l = parseFloat(parts[2].replace('%', '')) / 100;
  }

  let c = (1 - Math.abs(2 * l - 1)) * s;
  let x = c * (1 - Math.abs((h / 60) % 2 - 1));
  let m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);

  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b)
    .toString(16)
    .slice(1)
    .toUpperCase();
}

// Remove static transporter
//
// Create a function to fetch SMTP options from res_options
async function getSmtpOptions() {
  const [rows] = await pool.execute(
    "SELECT option_name, option_value FROM res_options WHERE option_name IN (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      "smtp_host",
      "smtp_port",
      "smtp_username",
      "smtp_password",
      "smtp_from_email",
      "smtp_from_name",
      "smtp_ssl_enabled",
      "smtp_tls_enabled"
    ]
  );
  const options = {};
  rows.forEach(row => {
    options[row.option_name] = row.option_value;
  });
  return options;
}

// Security: Validate file paths and extensions
const isValidPartialFile = (file) => {
  const validExtensions = [".html"];
  const ext = path.extname(file).toLowerCase();
  return validExtensions.includes(ext);
};

// Register partials with Handlebars
async function registerPartials() {
  try {
    const partialsDir = path.join(process.cwd(), "emails", "partials");

    // Verify directory exists
    await fs.access(partialsDir);

    const files = await fs.readdir(partialsDir);

    for (const file of files) {
      if (!isValidPartialFile(file)) continue;

      const filePath = path.join(partialsDir, file);
      const content = await fs.readFile(filePath, "utf8");
      const partialName = path.basename(file, ".html");
      Handlebars.registerPartial(partialName, content);
    }
  } catch (error) {
    console.error("Error registering partials:", error);
    throw error; // Re-throw to handle in calling function
  }
}

// Get site settings from database
async function getSiteSettings() {
  try {
    // Fetch all options from res_options table
    const [rows] = await pool.execute("SELECT option_name, option_value FROM res_options");
    const settings = {};
    rows.forEach(row => {
      settings[row.option_name] = row.option_value;
    });
    return settings; // Return settings object
  } catch (error) {
    console.error("Error reading site settings from database:", error);
    throw error;
  }
}

// Compile and render email template
async function renderEmail(templateName, data = {}) {
  try {
    await registerPartials();
    const siteSettings = await getSiteSettings();

    // Validate template name to prevent path traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(templateName)) {
      throw new Error("Invalid template name");
    }

    const layoutPath = path.join(
      process.cwd(),
      "emails",
      "layouts",
      "main-layout.html"
    );
    const templatePath = path.join(
      process.cwd(),
      "emails",
      "templates",
      `${templateName}.html`
    );

    // Read files in parallel
    const [layoutSource, templateSource] = await Promise.all([
      fs.readFile(layoutPath, "utf8"),
      fs.readFile(templatePath, "utf8"),
    ]);

    const layoutTemplate = Handlebars.compile(layoutSource);
    const contentTemplate = Handlebars.compile(templateSource);

    const combinedData = {
      ...data,
      siteName: siteSettings.site_name,
      logoUrl: `${process.env.MEDIA_URL}/${siteSettings.logo}`,
      primaryColor: hslToHex(siteSettings.primary_color || "#f27a24"),
      currentYear: new Date().getFullYear(),
      supportEmail: siteSettings.smtp_from_email || siteSettings.store_email,
    };
    const content = contentTemplate(combinedData);
    return layoutTemplate({ ...combinedData, content });
  } catch (error) {
    console.error("Error rendering email:", error);
    throw error;
  }
}

async function sendEmail(email, subject, templateName, data) {
  try {
    if (!email || !subject || !templateName) {
      throw new Error("Missing required parameters");
    }

    // Fetch SMTP options from DB
    const smtpOptions = await getSmtpOptions();

    const transporter = nodemailer.createTransport({
      host: smtpOptions.smtp_host,
      port: Number(smtpOptions.smtp_port),
      secure: smtpOptions.smtp_ssl_enabled === "1", // true for 465, false for others
      auth: {
        user: smtpOptions.smtp_username,
        pass: smtpOptions.smtp_password
      },
      tls: {
        rejectUnauthorized: smtpOptions.smtp_tls_enabled === "1" ? false : true,
      },
    });

    const emailHtml = await renderEmail(templateName, data);

    const mailOptions = {
      from: `"${smtpOptions.smtp_from_name || "Support"}" <${smtpOptions.smtp_from_email || smtpOptions.smtp_username}>`,
      to: email,
      subject: subject,
      html: emailHtml,
    };

    // Use promise-based approach instead of callback
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: ", info.response);
    
    return { success: true, message: "Email sent successfully" };
  } catch (error) {
    console.error("Error sending email:", error);
    
    // Handle specific SMTP authentication errors
    if (error.code === 'EAUTH') {
      console.error("SMTP Authentication failed. Please check your SMTP credentials.");
      return { 
        success: false, 
        error: "Email service authentication failed. Please contact support.",
        details: "SMTP credentials may be incorrect or account may be locked."
      };
    }
    
    // Handle other SMTP errors
    if (error.code && error.code.startsWith('E')) {
      console.error("SMTP Error:", error.message);
      return { 
        success: false, 
        error: "Email service temporarily unavailable. Please try again later.",
        details: error.message
      };
    }
    
    // Handle template rendering errors
    if (error.message && error.message.includes('template')) {
      return { 
        success: false, 
        error: "Email template error. Please contact support.",
        details: error.message
      };
    }
    
    // Generic error handling
    return { 
      success: false, 
      error: "Failed to send email. Please try again later.",
      details: error.message
    };
  }
}

module.exports = {
  sendEmail,
};
