const express = require("express");
const { pool } = require("../../config/database");
const axios = require("axios");
const crypto = require("crypto");
const requestIp = require('request-ip');
const { ErrorLogger } = require("../../logger");
const NotificationService = require("../../services/notificationService");

// Enhanced machine ID generation with client-side hardware data
function generateMachineId(req) {
  const userAgent = req.headers["user-agent"] || "";
  const acceptLanguage = req.headers["accept-language"] || "";
  const secChUaPlatform = req.headers["sec-ch-ua-platform"] || "";
  const secChUaMobile = req.headers["sec-ch-ua-mobile"] || "";
  const secChUaArch = req.headers["sec-ch-ua-arch"] || "";
  
  // Extract device name from user agent
  const deviceName = extractDeviceName(userAgent);
  
  // Extract system identifiers
  const systemId = extractSystemIdentifier(req);
  
  // Add user-specific language preferences for additional uniqueness
  const languageCode = extractLanguageCode(acceptLanguage);
  
  // Get platform info
  const platformInfo = extractPlatformInfo(userAgent);
  
  // Create a simple machine signature - focuses on device characteristics
  const machineSignature = `${platformInfo}-${secChUaPlatform}-${secChUaMobile}-${secChUaArch}-${deviceName}-${languageCode}-${systemId}`;
  
  const fullHash = crypto
    .createHash("sha256")
    .update(machineSignature)
    .digest("hex");

  // 32 characters long machine ID
  const machineId = fullHash.substring(0, 32);
  
  return machineId;
}

// Extract actual device name from user agent
function extractDeviceName(userAgent) {
  try {
    // Generic approach: Extract device type and capabilities
    let deviceInfo = "";
    
    // Operating System detection
    if (userAgent.includes("Windows NT")) {
      const windowsMatch = userAgent.match(/Windows NT (\d+\.\d+)/);
      deviceInfo += windowsMatch ? `windows-${windowsMatch[1]}` : "windows";
    } else if (userAgent.includes("Mac OS X")) {
      deviceInfo += "macos";
    } else if (userAgent.includes("Linux")) {
      deviceInfo += "linux";
    } else if (userAgent.includes("Android")) {
      deviceInfo += "android";
    } else if (userAgent.includes("iOS")) {
      deviceInfo += "ios";
    }
    
    // Device type detection
    if (userAgent.includes("Mobile") || userAgent.includes("Android") || userAgent.includes("iPhone")) {
      deviceInfo += "-mobile";
    } else if (userAgent.includes("Tablet") || userAgent.includes("iPad")) {
      deviceInfo += "-tablet";
    } else {
      deviceInfo += "-desktop";
    }
    
    // Architecture detection
    if (userAgent.includes("WOW64") || userAgent.includes("x64") || userAgent.includes("x86_64")) {
      deviceInfo += "-x64";
    } else if (userAgent.includes("Win32") || userAgent.includes("i686")) {
      deviceInfo += "-x86";
    } else if (userAgent.includes("arm64")) {
      deviceInfo += "-arm64";
    } else if (userAgent.includes("ARM")) {
      deviceInfo += "-arm";
    }
    
    // Browser engine detection (for additional uniqueness)
    if (userAgent.includes("Chrome") || userAgent.includes("Edg") || userAgent.includes("Safari")) {
      deviceInfo += "-webkit";
    } else if (userAgent.includes("Firefox")) {
      deviceInfo += "-gecko";
    }
    
    return deviceInfo || "unknown-device";
  } catch (error) {
    console.error("Error extracting device name:", error);
    return "unknown-device";
  }
}

// Extract system identifier from various headers
function extractSystemIdentifier(req) {
  try {
    const userAgent = req.headers["user-agent"] || "";
    
    // Try to extract computer name from user agent (Windows)
    const computerNameMatch = userAgent.match(/Windows NT \d+\.\d+; ([^;]+)/);
    if (computerNameMatch) {
      const computerName = computerNameMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '');
      return computerName;
    }
    
    // Try to extract Mac device identifier
    if (userAgent.includes("Mac OS X")) {
      const macMatch = userAgent.match(/Mac OS X (\d+_\d+)/);
      if (macMatch) {
        const macId = `mac-${macMatch[1]}`;
        return macId;
      }
    }
    
    // Use sec-ch-ua headers for additional uniqueness
    const secChUaPlatform = req.headers["sec-ch-ua-platform"] || "";
    const secChUaArch = req.headers["sec-ch-ua-arch"] || "";
    const secChUaModel = req.headers["sec-ch-ua-model"] || "";
    const secChUaBitness = req.headers["sec-ch-ua-bitness"] || "";
    const secChUaWows64 = req.headers["sec-ch-ua-wows64"] || "";
    
    // Combine sec-ch-ua headers for unique system fingerprint
    const systemFingerprint = `${secChUaPlatform}-${secChUaArch}-${secChUaModel}-${secChUaBitness}-${secChUaWows64}`;
    
    if (systemFingerprint !== '---') {
      const cleanedFingerprint = systemFingerprint.toLowerCase().replace(/[^a-z0-9-]/g, '');
      return cleanedFingerprint;
    }
    
    // Fallback: use a combination of stable headers
    const fallbackId = `${req.headers["accept-language"] || ""}-${req.headers["accept-encoding"] || ""}`;
    const cleanedFallback = fallbackId.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 16);
    return cleanedFallback;
    
  } catch (error) {
    console.error("Error extracting system identifier:", error);
    return "unknown-system";
  }
}

// Extract primary language code from accept-language header
function extractLanguageCode(acceptLanguage) {
  try {
    const primaryLang = acceptLanguage.split(',')[0].trim();
    const langCode = primaryLang.split('-')[0].toLowerCase();
    return langCode || 'en';
  } catch (error) {
    return 'en';
  }
}

// Simple trust check function
function isMachineTrusted(deviceData, machineId) {
  try {
    const deviceInfo = Array.isArray(deviceData.devices) ? deviceData.devices : [];
    
    // Check if machine ID exists in trusted devices
    const trustedDevice = deviceInfo.find(device => device.machineId === machineId);
    
    return {
      isTrusted: !!trustedDevice,
      device: trustedDevice
    };
  } catch (error) {
    console.error("Error checking machine trust:", error);
    return {
      isTrusted: false,
      device: null
    };
  }
}

// Safe JSON parse function
function safeJsonParse(jsonString, defaultValue = { devices: [] }) {
  try {
    if (!jsonString || jsonString === 'null' || jsonString === 'undefined') {
      return defaultValue;
    }
    const parsed = JSON.parse(jsonString);
    return parsed && typeof parsed === 'object' ? parsed : defaultValue;
  } catch (error) {
    console.error("Error parsing JSON:", error);
    return defaultValue;
  }
}

// Validate machine ID format
function validateMachineId(machineId) {
  if (!machineId || typeof machineId !== 'string') {
    return false;
  }
  // Machine ID should be 32 characters hex string
  return /^[a-f0-9]{32}$/.test(machineId);
}

// Clean up old devices (remove devices older than 30 days)
// Note: This function is kept for potential future use but should not be called automatically
// as it would remove authorized devices without user consent
function cleanupOldDevices(devices) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return devices.filter(device => {
    const lastUsed = new Date(device.lastUsed || device.trustedAt);
    return lastUsed > thirtyDaysAgo;
  });
}

// Remove a specific trusted device
async function removeTrustedDevice(req, res) {
  try {
    const userId = req.user?.id;
    const { machineId } = req.body;

    if (!userId || !machineId) {
      return res.status(400).json({
        status: "error",
        message: "Missing required fields",
      });
    }

    // Validate machineId format
    if (!validateMachineId(machineId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid machine ID format.",
      });
    }

    // Fetch user's current active package
    const [packages] = await pool.execute(
      "SELECT * FROM res_upackages WHERE user_id = ? AND is_current = 1",
      [userId]
    );

    if (packages.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "No active package found.",
      });
    }

    let currentPackage = packages[0];
    const deviceData = safeJsonParse(currentPackage.devices_fp);
    const deviceInfo = Array.isArray(deviceData.devices) ? deviceData.devices : [];

    // Find and remove the device
    const updatedDeviceInfo = deviceInfo.filter(device => device.machineId !== machineId);

    // Check if device was actually removed
    if (updatedDeviceInfo.length === deviceInfo.length) {
      return res.status(404).json({
        status: "error",
        message: "Device not found in trusted devices.",
      });
    }

    // Update the database
    await pool.execute(
      "UPDATE res_upackages SET devices_fp = ? WHERE upackage_id = ?",
      [
        JSON.stringify({ 
          devices: updatedDeviceInfo 
        }),
        currentPackage.upackage_id,
      ]
    );

    return res.status(200).json({
      status: "success",
      message: "Device successfully removed from trusted devices.",
      totalDevices: updatedDeviceInfo.length,
      maxDevices: currentPackage.devices
    });
  } catch (error) {
    console.error("Error removing trusted device:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}

function extractPlatformInfo(userAgent) {
  try {
    // Extract stable platform information, focusing on device rather than browser
    let platform = "";
    
    // Operating System detection (most important for device identification)
    if (userAgent.includes("Windows NT")) {
      const windowsMatch = userAgent.match(/Windows NT (\d+\.\d+)/);
      platform += windowsMatch ? `Windows-${windowsMatch[1]}` : "Windows";
    } else if (userAgent.includes("Mac OS X")) {
      platform += "MacOS";
    } else if (userAgent.includes("Linux")) {
      platform += "Linux";
    } else if (userAgent.includes("Android")) {
      platform += "Android";
    } else if (userAgent.includes("iOS")) {
      platform += "iOS";
    }
    
    // Architecture (important for device identification)
    if (userAgent.includes("WOW64") || userAgent.includes("x64") || userAgent.includes("x86_64")) {
      platform += "-64bit";
    } else if (userAgent.includes("Win32") || userAgent.includes("i686")) {
      platform += "-32bit";
    } else if (userAgent.includes("arm64")) {
      platform += "-arm64";
    }
    
    // Don't include browser-specific info as it changes between browsers
    // This makes the fingerprint more stable
    
    return platform || "Unknown";
  } catch (error) {
    console.error("Error extracting platform info:", error);
    return "Unknown";
  }
}

async function downloadFeaturedFile(req, res) {
  const userId = req.user?.id;
  const { file_id } = req.query;

  if (!file_id) {
    return res.status(400).json({
      status: "error",
      message: "Missing file_id parameter"
    });
  }

  try {
    // Step 1: Validate file
    const [fileRows] = await pool.execute(
      "SELECT * FROM res_files WHERE file_id = ?",
      [file_id]
    );
    if (fileRows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "File not found" });
    }

    const file = fileRows[0];

    const isFreeOrFeatured =
      file.is_featured === 1 || parseFloat(file.price) === 0;

    if (!isFreeOrFeatured) {
      return res.status(400).json({
        status: "error",
        message: "File is not featured. Please purchase it first.",
      });
    }

    // Step 2: Get user packages
    const [userPackages] = await pool.execute(
      "SELECT * FROM res_upackages WHERE user_id = ?",
      [userId]
    );

    if (userPackages.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "You don't have a valid package. Please purchase one.",
      });
    }

    const now = new Date();

    const activePackages = userPackages.filter(
      (pkg) => new Date(pkg.date_expire) > now
    );

    if (activePackages.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Your package has expired. Please purchase a new one.",
      });
    }

    // Step 3: Determine current package
    let currentPackage = activePackages.find((pkg) => pkg.is_current === 1);

    if (!currentPackage) {
      currentPackage = activePackages[0];

      await pool.execute(
        "UPDATE res_upackages SET is_current = 1 WHERE upackage_id = ?",
        [currentPackage.upackage_id]
      );

      await pool.execute(
        "UPDATE res_upackages SET is_current = 0 WHERE user_id = ? AND upackage_id != ?",
        [userId, currentPackage.upackage_id]
      );
    }

    if (currentPackage.is_active === 0) {
      return res.status(400).json({
        status: "error",
        message: "Your package is not active. Please contact support.",
      });
    }

    // Step 4: Check bandwidth + file usage
    const [downloads] = await pool.execute(
      "SELECT * FROM res_udownloads WHERE user_id = ? AND upackage_id = ?",
      [userId, currentPackage.upackage_id]
    );

    const today = new Date().setHours(0, 0, 0, 0);

    const usage = downloads.reduce(
      (acc, d) => {
        const size = parseFloat(d.file_size);
        acc.totalBandwidth += size;

        const dDate = new Date(d.created_at).setHours(0, 0, 0, 0);
        if (dDate === today) {
          acc.todayBandwidth += size;
          acc.todayFiles += 1;
        }
        return acc;
      },
      { totalBandwidth: 0, todayBandwidth: 0, todayFiles: 0 }
    );

    // get total files downloads

    const [totalFilesDownloads] = await pool.execute(
      "SELECT COUNT(*) as total_files_downloads FROM res_udownloads WHERE user_id = ? AND upackage_id = ?",
      [userId, currentPackage.upackage_id]
    );

    console.log(totalFilesDownloads[0].total_files_downloads);

    // Validate 1: Bandwidth

    if (currentPackage.bandwidth !== 0 && usage.totalBandwidth > currentPackage.bandwidth) {
      return res.status(400).json({
        status: "error",
        message: "You have used all your bandwidth. Please purchase new package.",
      });
    }

    // Validate 2: Total Files Downloads
    // check if the bandwidth_files is used with total files download and not equal to 0

    if (currentPackage.bandwidth_files !== 0 && totalFilesDownloads[0].total_files_downloads >= currentPackage.bandwidth_files) {
      return res.status(400).json({
        status: "error",
        message: "You have used all your files download limit. Please purchase new package to continue downloading files.",
      });
    }

    // Validate 3: Fair Means Daily Bandwidth

    if (currentPackage.fair != 0 && usage.todayBandwidth >= currentPackage.fair) {
      return res.status(400).json({
        status: "error",
        message: "You have reached your daily bandwidth limit.",
      });
    }

    // Validate 4: Fair Means Daily Files Downloads

    if (currentPackage.fair_files != 0 && usage.todayFiles >= currentPackage.fair_files) {
      return res.status(400).json({
        status: "error",
        message: "You have reached your daily file download limit.",
      });
    }

    // Step 5: Machine ID trust check
    const machineId = generateMachineId(req);
    
    const deviceData = safeJsonParse(currentPackage.devices_fp);
    
    // Check if machine is trusted
    const trustResult = isMachineTrusted(deviceData, machineId);
    const { isTrusted, device: existingDevice } = trustResult;
    
    if (isTrusted) {
      // Machine is trusted - update last used timestamp
      const deviceInfo = Array.isArray(deviceData.devices) ? deviceData.devices : [];
      
      const updatedDeviceInfo = deviceInfo.map(device => {
        if (device.machineId === machineId) {
          return {
            ...device,
            lastUsed: new Date().toISOString(),
            ipAddress: requestIp.getClientIp(req)
          };
        }
        return device;
      });
      
      await pool.execute(
        "UPDATE res_upackages SET devices_fp = ? WHERE upackage_id = ?",
        [
          JSON.stringify({ 
            devices: updatedDeviceInfo 
          }),
          currentPackage.upackage_id,
        ]
      );
    } else {
      // Machine not trusted - check device limit
      const deviceInfo = Array.isArray(deviceData.devices) ? deviceData.devices : [];
      
      if (deviceInfo.length >= currentPackage.devices) {
        return res.status(400).json({
          status: "error",
          message: "You have reached your device limit. Please contact support team to increase device limit.",
        });
      }

      // Show trust modal
      return res.status(200).json({
        status: "success",
        isShowTrustModal: true,
        totalUsedDevices: deviceInfo.length,
        totalAllowedDevices: currentPackage.devices,
        machineId: machineId,
        deviceInfo: {
          platform: extractPlatformInfo(req.headers["user-agent"] || ""),
          userAgent: req.headers["user-agent"] || "",
          language: req.headers["accept-language"] || "",
          machineId: machineId,
          ipAddress: requestIp.getClientIp(req)
        }
      });
    }

    // Step 6: Generate secure download link
    const result = await generateDownloadLink(
      userId,
      file_id,
      req,
      currentPackage.upackage_id,
      null
    );

    // send notification to admin
    await NotificationService.createNotification(
      "file_downloaded",
      "File Downloaded",
      `Featured File ${file.title} has been downloaded by user ${userId}`,
      { file_id: file.file_id, user_id: userId }
    );

    return res.status(200).json({
      status: "success",
      link: `${process.env.APP_BASE_URL}/download?token=${result.token}`,
      fileUrl: result.fileUrl,
      isAlreadyDownloaded: result.isAlreadyDownloaded
    });

  } catch (err) {
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'download',
      errorLevel: 'error',
      errorMessage: err.message,
      errorDetails: err,
      userId: req.user?.id,
      endpoint: '/downloadFeaturedFile'
    });
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}

async function downloadFreeFile(req, res) {
  const { file_id } = req.query;

  const userId = req.user?.id; // ✅ Get user ID from authenticated request

  try {
    // Step 1: Validate file
    const [fileRows] = await pool.execute(
      "SELECT * FROM res_files WHERE file_id = ?",
      [file_id]
    );

    if (fileRows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "File not found",
      });
    }

    const file = fileRows[0];
    const isFreeOrFeatured =
      file.is_featured === 1 || parseFloat(file.price) === 0;

    if (!isFreeOrFeatured) {
      return res.status(400).json({
        status: "error",
        message: "File is not free. Please purchase it first.",
      });
    }

    const result = await generateDownloadLink(userId, file_id, req, null, null);

    // send notification to admin
    await NotificationService.createNotification(
      "file_downloaded",
      "File Downloaded",
      `Free File ${file.title} has been downloaded by user ${userId}`,
      { file_id: file.file_id, user_id: userId }
    );

    return res.status(200).json({
      status: "success",
      link: `${process.env.APP_BASE_URL}/download?token=${result.token}`,
      fileUrl: result.fileUrl,
    });
  } catch (err) {
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'download',
      errorLevel: 'error',
      errorMessage: err.message,
      errorDetails: err,
      userId: req.user?.id,
      endpoint: '/downloadFreeFile'
    });
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}

async function downloadPaidFile(req, res) {
  const userId = req.user?.id;
  const { file_id, order_id } = req.query;

  if (!file_id || !order_id) {
    return res.status(400).json({
      status: "error",
      message: "Missing file_id or order_id",
    });
  }

  try {
    // Step 1: Verify that user purchased this file
    const [filesRow] = await pool.execute(
      "SELECT * FROM res_ufiles WHERE file_id = ? AND order_id = ? AND user_id = ?",
      [file_id, order_id, userId]
    );

    if (filesRow.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "File not found or not purchased",
      });
    }

    // check if the file is active

    const file = filesRow[0];

    if (file.is_active === 0) {
      return res.status(400).json({
        status: "error",
        message: "Your file is not active. Please contact support.",
      });
    }

    // Step 2: Check if a download token already exists
    const [downloadRows] = await pool.execute(
      "SELECT * FROM res_udownloads WHERE file_id = ? AND order_id = ? AND user_id = ?",
      [file_id, order_id, userId]
    );

    if (downloadRows.length === 0) {
      // No token yet — generate a fresh one
      const result = await generateDownloadLink(
        userId,
        file_id,
        req,
        null,
        order_id
      );

      return res.status(200).json({
        status: "success",
        link: `${process.env.APP_BASE_URL}/download?token=${result.token}`,
        fileUrl: result.fileUrl,
      });
    } else {
      // Token exists — check expiration
      const download = downloadRows[0];
      const expiredAt = new Date(download.expired_at).getTime();

      if (expiredAt < Date.now()) {
        return res.status(400).json({
          status: "error",
          message: "Download link has expired",
        });
      }

      // send notification to admin
      await NotificationService.createNotification(
        "file_downloaded",
        "File Downloaded",
        `Paid File ${file.title} has been downloaded by user ${userId}`,
        { file_id: file.file_id, user_id: userId }
      );

      return res.status(200).json({
        status: "success",
        link: `${process.env.APP_BASE_URL}/download?token=${download.hash_token}`,
        fileUrl: download.file_url,
      });
    }
  } catch (err) {
    console.error("Download error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}


async function generateDownloadLink(userId, fileId, req, packageId = null, orderId = null) {
  try {
    // 1. Validate that the file exists
    const [fileRows] = await pool.execute(
      "SELECT * FROM res_files WHERE file_id = ?",
      [fileId]
    );

    if (fileRows.length === 0) {
      throw new Error("File not found");
    }

    const file = fileRows[0];

    if (!file.url) {
      throw new Error("Invalid file URL");
    }

    // 2. Check if a previous download record exists
    const [existingDownloads] = await pool.execute(
      `SELECT * FROM res_udownloads 
       WHERE user_id = ? AND file_id = ? 
       ORDER BY created_at DESC`,
      [userId, fileId]
    );

    const latestDownload = existingDownloads[0];

    if (latestDownload) {
      const isLinkStillValid =
        new Date(latestDownload.expired_at).getTime() > Date.now();

      if (isLinkStillValid) {
        return {
          token: latestDownload.hash_token,
          fileUrl: file.url,
          isAlreadyDownloaded: true
        };
      }
      // Token expired, proceed to create new one
    }

    const DOWNLOAD_LINK_EXPIRY_HOURS = parseInt(process.env.DOWNLOAD_LINK_EXPIRY_HOURS) || 24;

    // 3. Generate new token and expiration date
    const newToken = crypto.randomBytes(12).toString("hex");
    const expirationDate = new Date(
      Date.now() + DOWNLOAD_LINK_EXPIRY_HOURS * 60 * 60 * 1000
    );
    
    const ipAddress = requestIp.getClientIp(req); // Retrieve the client's IP address
    const userTracker = `https://api.findip.net/${ipAddress}/?token=4b6ba9b249fe419085f87cb6d7e26d00`

    // 4. Insert new download record
    await pool.execute(
      `INSERT INTO res_udownloads 
      (user_id, file_id, upackage_id, order_id, file_title, file_size, download_url, file_url, url_type, ip_address, hash_token, expired_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        fileId,
        packageId,
        orderId,
        file.title,
        file.size,
        null,
        file.url,
        file.url_type,
        ipAddress,
        newToken,
        expirationDate,
      ]
    );

    // 5. Update file download count
    await pool.execute(
      "UPDATE res_files SET downloads = downloads + 1 WHERE file_id = ?",
      [file.file_id]
    );

    // 🧹 AUTO-CLEAR CACHE: Clear this specific file's cache to show updated download count
    const { clearByPattern } = require("../../config/smart-cache");
    await clearByPattern(`files:file:*${file.file_id}*`);
    await clearByPattern(`files:*file_id:${file.file_id}*`);

    return {
      token: newToken,
      fileUrl: file.url,
      isAlreadyDownloaded: false
    };
  } catch (error) {
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'download',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      userId: userId,
      endpoint: '/generateDownloadLink'
    });
    throw new Error(`Failed to generate download link: ${error.message}`);
  }
}


async function downloadFile(req, res) {
  try {
    const token = req.query.token;
    const userId = req.user?.id; // ✅ Get user ID from authenticated request

    if (!token) {
      return res.status(400).json({
        status: "error",
        message: "No download token provided",
      });
    }

    // 1. Fetch token details from DB
    const [tokenRows] = await pool.execute(
      "SELECT * FROM res_udownloads WHERE hash_token = ?",
      [token]
    );

    if (tokenRows.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid or expired download link",
      });
    }

    const downloadRecord = tokenRows[0];

    // 2. Check if token is expired
    const expiredAt = new Date(downloadRecord.expired_at).getTime();
    if (expiredAt < Date.now()) {
      return res.status(400).json({
        status: "error",
        message: "Download link has expired",
      });
    }

    // 3. Ensure the same user is downloading
    if (userId !== downloadRecord.user_id) {
      return res.status(403).json({
        status: "error",
        message: "This download link does not belong to your account",
      });
    }

    // 4. Get the file info
    const [fileRows] = await pool.execute(
      "SELECT * FROM res_files WHERE file_id = ?",
      [downloadRecord.file_id]
    );

    if (fileRows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "File not found",
      });
    }

    const file = fileRows[0];

    // send notification to admin
    await NotificationService.createNotification(
      "file_downloaded",
      "File Downloaded",
      `File ${file.title} has been downloaded by user ${userId}`,
      { file_id: file.file_id, user_id: userId }
    );

    // 6. Return the file download URL
    return res.status(200).json({
      status: "success",
      link: file.url,
    });
  } catch (error) {
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'download',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      userId: req.user?.id,
      endpoint: '/downloadFile'
    });
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}

async function trustDevice(req, res) {
  try {
    const userId = req.user?.id;
    const { machineId } = req.body;

    if (!userId || !machineId) {
      return res.status(400).json({
        status: "error",
        message: "Missing required fields",
      });
    }

    // Validate machineId format
    if (!validateMachineId(machineId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid machine ID format.",
      });
    }

    // Fetch user's current active package
    const [packages] = await pool.execute(
      "SELECT * FROM res_upackages WHERE user_id = ? AND is_current = 1",
      [userId]
    );

    if (packages.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "No active package found. Please purchase a package.",
      });
    }

    let currentPackage = packages[0];
    const deviceData = safeJsonParse(currentPackage.devices_fp);
    const deviceInfo = Array.isArray(deviceData.devices) ? deviceData.devices : [];

    // Check if machine is already trusted
    const isAlreadyTrusted = deviceInfo.some(device => device.machineId === machineId);

    if (isAlreadyTrusted) {
      return res.status(200).json({
        status: "success",
        message: "Machine is already trusted",
      });
    }

    // Extract comprehensive device information
    const userAgent = req.headers["user-agent"] || "";
    const deviceName = extractDeviceName(userAgent);
    const platformInfo = extractPlatformInfo(userAgent);
    const ipAddress = requestIp.getClientIp(req);

    // Add machine with comprehensive metadata
    const updatedDeviceInfo = [...deviceInfo, {
      machineId: machineId,
      deviceName: deviceName,
      platform: platformInfo,
      ipAddress: ipAddress,
      userAgent: userAgent,
      language: req.headers["accept-language"] || "",
      trustedAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      // Additional headers for better device identification
      headers: {
        acceptEncoding: req.headers["accept-encoding"] || "",
        acceptCharset: req.headers["accept-charset"] || "",
        secChUa: req.headers["sec-ch-ua"] || "",
        secChUaPlatform: req.headers["sec-ch-ua-platform"] || "",
        secChUaMobile: req.headers["sec-ch-ua-mobile"] || "",
        secChUaArch: req.headers["sec-ch-ua-arch"] || "",
        secChUaModel: req.headers["sec-ch-ua-model"] || ""
      }
    }];

    await pool.execute(
      "UPDATE res_upackages SET devices_fp = ? WHERE upackage_id = ?",
      [
        JSON.stringify({ 
          devices: updatedDeviceInfo 
        }),
        currentPackage.upackage_id,
      ]
    );

    // send notification to admin

    await NotificationService.createNotification(
      "device_trusted",
      "Device Trusted",
      `Device ${deviceName} has been trusted by user ${userId}`,
      { device_id: machineId, user_id: userId }
    );

    return res.status(200).json({
      status: "success",
      message: "Machine successfully added as trusted.",
      deviceName: deviceName
    });
  } catch (error) {
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'device_trust',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      userId: req.user?.id,
      endpoint: '/trustDevice'
    });
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}

async function getUserTrustedDevices(req, res) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized",
      });
    }

    // Fetch user's current active package
    const [packages] = await pool.execute(
      "SELECT * FROM res_upackages WHERE user_id = ? AND is_current = 1",
      [userId]
    );

    if (packages.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "No active package found.",
      });
    }

    const currentPackage = packages[0];
    const deviceData = safeJsonParse(currentPackage.devices_fp);
    const deviceInfo = Array.isArray(deviceData.devices) ? deviceData.devices : [];

    const devicesWithStatus = deviceInfo.map(device => ({
      id: device.machineId,
      machineId: device.machineId,
      deviceName: device.deviceName || "Unknown Device",
      platform: device.platform || "Unknown Platform",
      userAgent: device.userAgent,
      ipAddress: device.ipAddress,
      language: device.language,
      trustedAt: device.trustedAt,
      lastUsed: device.lastUsed,
      isCurrent: device.machineId === generateMachineId(req)
    }));

    return res.status(200).json({
      status: "success",
      devices: devicesWithStatus,
      totalDevices: deviceInfo.length,
      maxDevices: currentPackage.devices
    });
  } catch (error) {
    console.error("Error fetching trusted devices:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}


async function getTopAndRecentFiles(req, res) {
  try {
    // Fetch top 20 files by visits
    const [topFiles] = await pool.execute(
      "SELECT file_id, folder_id, title, slug, description, thumbnail, visits, downloads, is_featured, price, rating_count, rating_points, size, created_at FROM res_files ORDER BY downloads DESC LIMIT 20"
    );

    // Fetch 20 most recent files
    const [recentFiles] = await pool.execute(
      "SELECT file_id, folder_id, title, slug, description, thumbnail, visits, downloads, is_featured, price, rating_count, rating_points, size, created_at FROM res_files ORDER BY created_at DESC LIMIT 20"
    );

    return res.status(200).json({
      status: "success",
      topFiles,
      recentFiles,
    });
  } catch (error) {
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'file_fetch',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      userId: req.user?.id,
      endpoint: '/getTopAndRecentFiles'
    });
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}

async function getDeviceFingerprint(req, res) {
  try {
    const machineId = generateMachineId(req);
    const userAgent = req.headers["user-agent"] || "";
    const platformInfo = extractPlatformInfo(userAgent);
    const deviceName = extractDeviceName(userAgent);
    const ipAddress = requestIp.getClientIp(req);
    
    return res.status(200).json({
      status: "success",
      machineId: machineId,
      deviceName: deviceName,
      platformInfo: platformInfo,
      ipAddress: ipAddress,
      headers: {
        userAgent: userAgent,
        acceptLanguage: req.headers["accept-language"] || "",
        acceptEncoding: req.headers["accept-encoding"] || "",
        acceptCharset: req.headers["accept-charset"] || "",
        secChUa: req.headers["sec-ch-ua"] || "",
        secChUaPlatform: req.headers["sec-ch-ua-platform"] || "",
        secChUaMobile: req.headers["sec-ch-ua-mobile"] || "",
        secChUaArch: req.headers["sec-ch-ua-arch"] || "",
        secChUaModel: req.headers["sec-ch-ua-model"] || ""
      }
    });
  } catch (error) {
    // send error log to error logger
    await ErrorLogger.logError({
      errorType: 'file_fetch',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      userId: req.user?.id,
      endpoint: '/getDeviceFingerprint'
    });
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
}

module.exports = {
  generateDownloadLink,
  downloadFile,
  downloadFeaturedFile,
  downloadFreeFile,
  downloadPaidFile,
  trustDevice,
  getTopAndRecentFiles,
  getUserTrustedDevices,
  getDeviceFingerprint,
  removeTrustedDevice
};