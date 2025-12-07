const { faker } = require('@faker-js/faker');

exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex('res_pages').del();

  // Mobile firmware pages for the website
  const pages = [
    {
      slug: 'mobile-firmware-guide',
      title: 'Complete Mobile Firmware Flashing Guide',
      description: 'Learn how to flash mobile firmware safely with our comprehensive guide covering Samsung, Xiaomi, OnePlus and more.',
      body: `
        <div class="firmware-guide">
          <h2>Mobile Firmware Flashing Guide</h2>
          
          <h3>What is Mobile Firmware?</h3>
          <p>Mobile firmware is the low-level software that controls your device's hardware. It includes the operating system, drivers, and system applications that make your phone work.</p>
          
          <h3>Popular Firmware Types</h3>
          <ul>
            <li><strong>Samsung Firmware:</strong> Stock ROMs for Galaxy devices using Odin tool</li>
            <li><strong>Xiaomi Firmware:</strong> MIUI and custom ROMs using Mi Flash Tool</li>
            <li><strong>OnePlus Firmware:</strong> OxygenOS firmware and custom ROMs</li>
            <li><strong>USB Drivers:</strong> Essential drivers for device communication</li>
          </ul>
          
          <h3>Safety Precautions</h3>
          <div class="warning-box">
            <p><strong>⚠️ Important:</strong> Flashing firmware can void your warranty and potentially brick your device. Always backup your data and follow instructions carefully.</p>
          </div>
          
          <h3>Required Tools</h3>
          <ul>
            <li>Odin Flash Tool (Samsung devices)</li>
            <li>Mi Flash Tool (Xiaomi devices)</li>
            <li>SP Flash Tool (MediaTek devices)</li>
            <li>USB Drivers for your device</li>
            <li>ADB and Fastboot tools</li>
          </ul>
          
          <h3>Step-by-Step Process</h3>
          <ol>
            <li>Download the correct firmware for your device model</li>
            <li>Install USB drivers on your computer</li>
            <li>Enable Developer Options and USB Debugging</li>
            <li>Boot your device into Download/Fastboot mode</li>
            <li>Connect device to computer and flash firmware</li>
            <li>Wait for completion and reboot device</li>
          </ol>
          
          <h3>Common Issues and Solutions</h3>
          <ul>
            <li><strong>Device not detected:</strong> Install proper USB drivers</li>
            <li><strong>Flash fails:</strong> Check firmware compatibility</li>
            <li><strong>Boot loop:</strong> Try factory reset or re-flash</li>
            <li><strong>Bricked device:</strong> Use emergency recovery mode</li>
          </ul>
        </div>
      `,
      layout: 1,
      is_active: 1,
      meta_title: 'Mobile Firmware Flashing Guide - Complete Tutorial',
      meta_keywords: 'mobile firmware, flashing guide, Samsung, Xiaomi, OnePlus, Odin, Mi Flash, stock ROM',
      meta_description: 'Complete guide to flashing mobile firmware on Samsung, Xiaomi, OnePlus devices. Learn safe flashing methods with Odin, Mi Flash Tool and more.',
      key: 'firmware-guide'
    },
    {
      slug: 'samsung-firmware-download',
      title: 'Samsung Firmware Download Center',
      description: 'Download official Samsung firmware for all Galaxy devices. Stock ROMs, custom ROMs, and flashing tools.',
      body: `
        <div class="samsung-firmware">
          <h2>Samsung Firmware Download Center</h2>
          
          <h3>Popular Samsung Devices</h3>
          <div class="device-grid">
            <div class="device-card">
              <h4>Galaxy S24 Series</h4>
              <p>Latest flagship devices with One UI 6.1</p>
              <ul>
                <li>Samsung Galaxy S24 Ultra</li>
                <li>Samsung Galaxy S24+</li>
                <li>Samsung Galaxy S24</li>
              </ul>
            </div>
            
            <div class="device-card">
              <h4>Galaxy A Series</h4>
              <p>Mid-range devices with great value</p>
              <ul>
                <li>Samsung Galaxy A54 5G</li>
                <li>Samsung Galaxy A34 5G</li>
                <li>Samsung Galaxy A24</li>
              </ul>
            </div>
            
            <div class="device-card">
              <h4>Galaxy Note Series</h4>
              <p>Premium devices with S Pen</p>
              <ul>
                <li>Samsung Galaxy Note 20 Ultra</li>
                <li>Samsung Galaxy Note 10+</li>
              </ul>
            </div>
          </div>
          
          <h3>Flashing Tools</h3>
          <ul>
            <li><strong>Odin Flash Tool:</strong> Official Samsung flashing utility</li>
            <li><strong>Samsung USB Drivers:</strong> Required for device communication</li>
            <li><strong>ADB Fastboot:</strong> Command-line tools for advanced users</li>
          </ul>
          
          <h3>Firmware Types</h3>
          <ul>
            <li><strong>Stock ROM:</strong> Official Samsung firmware</li>
            <li><strong>Custom ROM:</strong> Modified Android versions</li>
            <li><strong>Recovery:</strong> TWRP and other custom recoveries</li>
            <li><strong>Kernel:</strong> Custom kernels for performance</li>
          </ul>
          
          <div class="download-section">
            <h3>Quick Downloads</h3>
            <div class="download-links">
              <a href="/downloads/odin-flash-tool" class="btn btn-primary">Download Odin Tool</a>
              <a href="/downloads/samsung-drivers" class="btn btn-secondary">Download USB Drivers</a>
              <a href="/downloads/firmware" class="btn btn-success">Browse Firmware</a>
            </div>
          </div>
        </div>
      `,
      layout: 1,
      is_active: 1,
      meta_title: 'Samsung Firmware Download - Galaxy Stock ROMs',
      meta_keywords: 'Samsung firmware, Galaxy ROM, Odin tool, stock firmware, Samsung drivers',
      meta_description: 'Download official Samsung firmware for Galaxy devices. Stock ROMs, Odin tool, USB drivers and flashing guides.',
      key: 'samsung-firmware'
    },
    {
      slug: 'xiaomi-firmware-download',
      title: 'Xiaomi Firmware Download Center',
      description: 'Download Xiaomi MIUI firmware, custom ROMs, and flashing tools for all Xiaomi, Redmi, and POCO devices.',
      body: `
        <div class="xiaomi-firmware">
          <h2>Xiaomi Firmware Download Center</h2>
          
          <h3>Popular Xiaomi Devices</h3>
          <div class="device-grid">
            <div class="device-card">
              <h4>Xiaomi 14 Series</h4>
              <p>Latest flagship with HyperOS</p>
              <ul>
                <li>Xiaomi 14 Pro</li>
                <li>Xiaomi 14</li>
                <li>Xiaomi 14 Ultra</li>
              </ul>
            </div>
            
            <div class="device-card">
              <h4>Redmi Note Series</h4>
              <p>Popular mid-range devices</p>
              <ul>
                <li>Redmi Note 13 Pro</li>
                <li>Redmi Note 12 Pro</li>
                <li>Redmi Note 11 Pro</li>
              </ul>
            </div>
            
            <div class="device-card">
              <h4>POCO Series</h4>
              <p>Gaming-focused devices</p>
              <ul>
                <li>POCO X6 Pro</li>
                <li>POCO F5 Pro</li>
                <li>POCO M5</li>
              </ul>
            </div>
          </div>
          
          <h3>Flashing Tools</h3>
          <ul>
            <li><strong>Mi Flash Tool:</strong> Official Xiaomi flashing utility</li>
            <li><strong>Xiaomi USB Drivers:</strong> Required for device communication</li>
            <li><strong>Mi Unlock Tool:</strong> For bootloader unlocking</li>
            <li><strong>SP Flash Tool:</strong> For MediaTek devices</li>
          </ul>
          
          <h3>Firmware Types</h3>
          <ul>
            <li><strong>MIUI ROM:</strong> Official Xiaomi firmware</li>
            <li><strong>Global ROM:</strong> International version</li>
            <li><strong>China ROM:</strong> Chinese market version</li>
            <li><strong>Custom ROM:</strong> LineageOS, Pixel Experience, etc.</li>
          </ul>
          
          <div class="unlock-section">
            <h3>Bootloader Unlocking</h3>
            <p>Most Xiaomi devices require bootloader unlocking before flashing custom firmware:</p>
            <ol>
              <li>Apply for unlock permission via Mi Unlock Tool</li>
              <li>Wait for approval (usually 7-15 days)</li>
              <li>Connect device in Fastboot mode</li>
              <li>Run unlock command</li>
            </ol>
          </div>
          
          <div class="download-section">
            <h3>Quick Downloads</h3>
            <div class="download-links">
              <a href="/downloads/mi-flash-tool" class="btn btn-primary">Download Mi Flash Tool</a>
              <a href="/downloads/xiaomi-drivers" class="btn btn-secondary">Download USB Drivers</a>
              <a href="/downloads/mi-unlock" class="btn btn-warning">Download Mi Unlock</a>
            </div>
          </div>
        </div>
      `,
      layout: 1,
      is_active: 1,
      meta_title: 'Xiaomi Firmware Download - MIUI ROMs & Tools',
      meta_keywords: 'Xiaomi firmware, MIUI ROM, Mi Flash Tool, Redmi firmware, POCO ROM',
      meta_description: 'Download Xiaomi MIUI firmware, custom ROMs, and flashing tools for Xiaomi, Redmi, and POCO devices.',
      key: 'xiaomi-firmware'
    },
    {
      slug: 'oneplus-firmware-download',
      title: 'OnePlus Firmware Download Center',
      description: 'Download OnePlus OxygenOS firmware, custom ROMs, and flashing tools for all OnePlus devices.',
      body: `
        <div class="oneplus-firmware">
          <h2>OnePlus Firmware Download Center</h2>
          
          <h3>Popular OnePlus Devices</h3>
          <div class="device-grid">
            <div class="device-card">
              <h4>OnePlus 12 Series</h4>
              <p>Latest flagship with OxygenOS 14</p>
              <ul>
                <li>OnePlus 12</li>
                <li>OnePlus 12R</li>
              </ul>
            </div>
            
            <div class="device-card">
              <h4>OnePlus 11 Series</h4>
              <p>Previous generation flagships</p>
              <ul>
                <li>OnePlus 11</li>
                <li>OnePlus 11R</li>
                <li>OnePlus 11 Pro</li>
              </ul>
            </div>
            
            <div class="device-card">
              <h4>OnePlus Nord Series</h4>
              <p>Mid-range devices</p>
              <ul>
                <li>OnePlus Nord 3</li>
                <li>OnePlus Nord CE 3</li>
                <li>OnePlus Nord 2T</li>
              </ul>
            </div>
          </div>
          
          <h3>Flashing Tools</h3>
          <ul>
            <li><strong>OnePlus USB Drivers:</strong> Required for device communication</li>
            <li><strong>ADB Fastboot:</strong> Command-line tools for flashing</li>
            <li><strong>OnePlus Tool:</strong> Official OnePlus flashing utility</li>
            <li><strong>MSM Download Tool:</strong> For emergency recovery</li>
          </ul>
          
          <h3>Firmware Types</h3>
          <ul>
            <li><strong>OxygenOS:</strong> Official OnePlus firmware</li>
            <li><strong>Global ROM:</strong> International version</li>
            <li><strong>Indian ROM:</strong> India-specific version</li>
            <li><strong>Custom ROM:</strong> LineageOS, Pixel Experience, etc.</li>
          </ul>
          
          <div class="unlock-section">
            <h3>Bootloader Unlocking</h3>
            <p>OnePlus devices have an easy bootloader unlocking process:</p>
            <ol>
              <li>Enable Developer Options</li>
              <li>Enable OEM Unlocking</li>
              <li>Connect device via ADB</li>
              <li>Run: <code>fastboot oem unlock</code></li>
            </ol>
          </div>
          
          <div class="download-section">
            <h3>Quick Downloads</h3>
            <div class="download-links">
              <a href="/downloads/oneplus-drivers" class="btn btn-primary">Download USB Drivers</a>
              <a href="/downloads/adb-fastboot" class="btn btn-secondary">Download ADB Tools</a>
              <a href="/downloads/oneplus-tool" class="btn btn-success">Download OnePlus Tool</a>
            </div>
          </div>
        </div>
      `,
      layout: 1,
      is_active: 1,
      meta_title: 'OnePlus Firmware Download - OxygenOS ROMs',
      meta_keywords: 'OnePlus firmware, OxygenOS ROM, OnePlus drivers, custom ROM',
      meta_description: 'Download OnePlus OxygenOS firmware, custom ROMs, and flashing tools for all OnePlus devices.',
      key: 'oneplus-firmware'
    },
    {
      slug: 'usb-drivers-download',
      title: 'USB Drivers Download Center',
      description: 'Download USB drivers for all mobile device brands. Samsung, Xiaomi, OnePlus, and universal Android drivers.',
      body: `
        <div class="usb-drivers">
          <h2>USB Drivers Download Center</h2>
          
          <p>USB drivers are essential for connecting your mobile device to a computer for firmware flashing, file transfer, and debugging. Download the correct drivers for your device brand below.</p>
          
          <h3>Brand-Specific Drivers</h3>
          <div class="driver-grid">
            <div class="driver-card">
              <h4>Samsung USB Drivers</h4>
              <p>Official Samsung USB drivers for all Galaxy devices</p>
              <ul>
                <li>Compatible with all Samsung devices</li>
                <li>Supports Odin Flash Tool</li>
                <li>Includes ADB and Fastboot support</li>
              </ul>
              <a href="/downloads/samsung-drivers" class="btn btn-primary">Download v1.7.50</a>
            </div>
            
            <div class="driver-card">
              <h4>Xiaomi USB Drivers</h4>
              <p>Official Xiaomi USB drivers for Mi, Redmi, and POCO devices</p>
              <ul>
                <li>Compatible with all Xiaomi devices</li>
                <li>Supports Mi Flash Tool</li>
                <li>Includes MediaTek support</li>
              </ul>
              <a href="/downloads/xiaomi-drivers" class="btn btn-primary">Download v2.0.8</a>
            </div>
            
            <div class="driver-card">
              <h4>OnePlus USB Drivers</h4>
              <p>Official OnePlus USB drivers for all OnePlus devices</p>
              <ul>
                <li>Compatible with all OnePlus devices</li>
                <li>Supports fastboot commands</li>
                <li>Includes Qualcomm support</li>
              </ul>
              <a href="/downloads/oneplus-drivers" class="btn btn-primary">Download v4.0.1</a>
            </div>
          </div>
          
          <h3>Universal Drivers</h3>
          <div class="universal-drivers">
            <div class="driver-card">
              <h4>ADB Fastboot Tools</h4>
              <p>Universal Android debugging and flashing tools</p>
              <ul>
                <li>Works with all Android devices</li>
                <li>Command-line interface</li>
                <li>Essential for custom ROM flashing</li>
              </ul>
              <a href="/downloads/adb-fastboot" class="btn btn-success">Download v33.0.3</a>
            </div>
            
            <div class="driver-card">
              <h4>Universal Android Drivers</h4>
              <p>Generic Android USB drivers for unknown devices</p>
              <ul>
                <li>Works with most Android devices</li>
                <li>Good fallback option</li>
                <li>Supports ADB and Fastboot</li>
              </ul>
              <a href="/downloads/universal-drivers" class="btn btn-secondary">Download Universal</a>
            </div>
          </div>
          
          <h3>Installation Instructions</h3>
          <ol>
            <li>Download the appropriate driver for your device</li>
            <li>Extract the driver files to a folder</li>
            <li>Connect your device to the computer</li>
            <li>Open Device Manager (Windows) or System Information (Mac)</li>
            <li>Find your device (may show as unknown device)</li>
            <li>Right-click and select "Update Driver"</li>
            <li>Browse to the extracted driver folder</li>
            <li>Install the driver and restart if prompted</li>
          </ol>
          
          <div class="troubleshooting">
            <h3>Troubleshooting</h3>
            <ul>
              <li><strong>Device not detected:</strong> Try different USB cable or port</li>
              <li><strong>Driver installation fails:</strong> Run installer as administrator</li>
              <li><strong>Still not working:</strong> Try universal Android drivers</li>
              <li><strong>Mac users:</strong> May need to allow unsigned drivers in System Preferences</li>
            </ul>
          </div>
        </div>
      `,
      layout: 1,
      is_active: 1,
      meta_title: 'USB Drivers Download - Mobile Device Drivers',
      meta_keywords: 'USB drivers, Samsung drivers, Xiaomi drivers, OnePlus drivers, ADB fastboot',
      meta_description: 'Download USB drivers for Samsung, Xiaomi, OnePlus and other mobile devices. Essential for firmware flashing and device communication.',
      key: 'usb-drivers'
    },
    {
      slug: 'privacy-policy',
      title: 'Privacy Policy',
      description: 'Our privacy policy explains how we collect, use, and protect your personal information when using our mobile firmware services.',
      body: `
        <div class="privacy-policy">
          <h2>Privacy Policy</h2>
          <p><strong>Last updated:</strong> ${new Date().toLocaleDateString()}</p>
          
          <h3>1. Information We Collect</h3>
          <p>We collect information you provide directly to us, such as when you:</p>
          <ul>
            <li>Create an account or profile</li>
            <li>Make a purchase or download files</li>
            <li>Subscribe to our services</li>
            <li>Contact us for support</li>
            <li>Participate in surveys or promotions</li>
          </ul>
          
          <h3>2. Types of Information</h3>
          <h4>Personal Information:</h4>
          <ul>
            <li>Name, email address, phone number</li>
            <li>Billing and payment information</li>
            <li>Account credentials and preferences</li>
          </ul>
          
          <h4>Technical Information:</h4>
          <ul>
            <li>Device information and IP address</li>
            <li>Browser type and operating system</li>
            <li>Usage patterns and download history</li>
            <li>Cookies and similar tracking technologies</li>
          </ul>
          
          <h3>3. How We Use Your Information</h3>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide and maintain our services</li>
            <li>Process transactions and send confirmations</li>
            <li>Send technical updates and security alerts</li>
            <li>Respond to customer service requests</li>
            <li>Improve our website and services</li>
            <li>Comply with legal obligations</li>
          </ul>
          
          <h3>4. Information Sharing</h3>
          <p>We do not sell, trade, or rent your personal information to third parties. We may share information only in the following circumstances:</p>
          <ul>
            <li>With your explicit consent</li>
            <li>To comply with legal requirements</li>
            <li>To protect our rights and safety</li>
            <li>With service providers who assist our operations</li>
          </ul>
          
          <h3>5. Data Security</h3>
          <p>We implement appropriate security measures to protect your personal information:</p>
          <ul>
            <li>Encryption of sensitive data in transit and at rest</li>
            <li>Regular security assessments and updates</li>
            <li>Limited access to personal information</li>
            <li>Secure payment processing</li>
          </ul>
          
          <h3>6. Your Rights</h3>
          <p>You have the right to:</p>
          <ul>
            <li>Access and update your personal information</li>
            <li>Request deletion of your data</li>
            <li>Opt-out of marketing communications</li>
            <li>Request data portability</li>
            <li>File complaints with data protection authorities</li>
          </ul>
          
          <h3>7. Cookies and Tracking</h3>
          <p>We use cookies and similar technologies to:</p>
          <ul>
            <li>Remember your preferences and settings</li>
            <li>Analyze website traffic and usage</li>
            <li>Provide personalized content</li>
            <li>Improve our services</li>
          </ul>
          
          <h3>8. Third-Party Services</h3>
          <p>Our website may contain links to third-party services. We are not responsible for their privacy practices. Please review their privacy policies before providing any information.</p>
          
          <h3>9. Children's Privacy</h3>
          <p>Our services are not intended for children under 13. We do not knowingly collect personal information from children under 13.</p>
          
          <h3>10. Changes to This Policy</h3>
          <p>We may update this privacy policy from time to time. We will notify you of any material changes by posting the new policy on this page.</p>
          
          <h3>11. Contact Us</h3>
          <p>If you have any questions about this privacy policy, please contact us:</p>
          <ul>
            <li>Email: privacy@mobilefirmware.com</li>
            <li>Phone: +1 (555) 123-4567</li>
            <li>Address: 123 Tech Street, Digital City, DC 12345</li>
          </ul>
        </div>
      `,
      layout: 1,
      is_active: 1,
      meta_title: 'Privacy Policy - Mobile Firmware Website',
      meta_keywords: 'privacy policy, data protection, personal information, mobile firmware',
      meta_description: 'Our privacy policy explains how we collect, use, and protect your personal information when using our mobile firmware services.',
      key: 'privacy-policy'
    },
    {
      slug: 'terms-of-service',
      title: 'Terms of Service',
      description: 'Terms and conditions for using our mobile firmware download and flashing services. Please read carefully before using our platform.',
      body: `
        <div class="terms-of-service">
          <h2>Terms of Service</h2>
          <p><strong>Last updated:</strong> ${new Date().toLocaleDateString()}</p>
          
          <h3>1. Acceptance of Terms</h3>
          <p>By accessing and using our mobile firmware services, you accept and agree to be bound by the terms and provision of this agreement.</p>
          
          <h3>2. Description of Service</h3>
          <p>We provide:</p>
          <ul>
            <li>Mobile firmware downloads for various device brands</li>
            <li>Flashing tools and utilities</li>
            <li>USB drivers and software</li>
            <li>Educational content and guides</li>
            <li>Technical support and assistance</li>
          </ul>
          
          <h3>3. User Responsibilities</h3>
          <p>As a user, you agree to:</p>
          <ul>
            <li>Provide accurate and complete information</li>
            <li>Use the service only for lawful purposes</li>
            <li>Not attempt to hack, damage, or disrupt the service</li>
            <li>Respect intellectual property rights</li>
            <li>Follow all applicable laws and regulations</li>
          </ul>
          
          <h3>4. Firmware Flashing Disclaimer</h3>
          <div class="warning-box">
            <p><strong>⚠️ Important Warning:</strong></p>
            <ul>
              <li>Flashing firmware may void your device warranty</li>
              <li>Incorrect flashing can permanently damage your device</li>
              <li>Always backup your data before flashing</li>
              <li>Use firmware only for your specific device model</li>
              <li>We are not responsible for any damage caused by flashing</li>
            </ul>
          </div>
          
          <h3>5. Intellectual Property</h3>
          <p>All content on our website, including:</p>
          <ul>
            <li>Software tools and utilities</li>
            <li>Educational guides and tutorials</li>
            <li>Website design and layout</li>
            <li>Trademarks and logos</li>
          </ul>
          <p>Are protected by intellectual property laws and remain our property or that of our licensors.</p>
          
          <h3>6. Payment Terms</h3>
          <p>For paid services:</p>
          <ul>
            <li>All payments are processed securely</li>
            <li>Refunds are subject to our refund policy</li>
            <li>Subscription services auto-renew unless cancelled</li>
            <li>Prices may change with notice</li>
          </ul>
          
          <h3>7. Prohibited Uses</h3>
          <p>You may not use our service to:</p>
          <ul>
            <li>Violate any laws or regulations</li>
            <li>Infringe on intellectual property rights</li>
            <li>Distribute malware or harmful software</li>
            <li>Spam or harass other users</li>
            <li>Attempt unauthorized access to our systems</li>
          </ul>
          
          <h3>8. Limitation of Liability</h3>
          <p>We provide our services "as is" without warranties. We are not liable for:</p>
          <ul>
            <li>Any damage to your device from firmware flashing</li>
            <li>Loss of data or personal information</li>
            <li>Service interruptions or technical issues</li>
            <li>Third-party actions or content</li>
          </ul>
          
          <h3>9. Account Termination</h3>
          <p>We may terminate your account if you:</p>
          <ul>
            <li>Violate these terms of service</li>
            <li>Engage in fraudulent activities</li>
            <li>Abuse our services or other users</li>
            <li>Fail to pay for services</li>
          </ul>
          
          <h3>10. Changes to Terms</h3>
          <p>We reserve the right to modify these terms at any time. Continued use of our service constitutes acceptance of the modified terms.</p>
          
          <h3>11. Governing Law</h3>
          <p>These terms are governed by the laws of [Your Jurisdiction]. Any disputes will be resolved through binding arbitration.</p>
          
          <h3>12. Contact Information</h3>
          <p>For questions about these terms, contact us:</p>
          <ul>
            <li>Email: legal@mobilefirmware.com</li>
            <li>Phone: +1 (555) 123-4567</li>
            <li>Address: 123 Tech Street, Digital City, DC 12345</li>
          </ul>
        </div>
      `,
      layout: 1,
      is_active: 1,
      meta_title: 'Terms of Service - Mobile Firmware Website',
      meta_keywords: 'terms of service, user agreement, mobile firmware, legal terms',
      meta_description: 'Terms and conditions for using our mobile firmware download and flashing services. Please read carefully before using our platform.',
      key: 'terms-of-service'
    },
    {
      slug: 'about-us',
      title: 'About Us',
      description: 'Learn about our mission to provide safe and reliable mobile firmware solutions for Android device enthusiasts worldwide.',
      body: `
        <div class="about-us">
          <h2>About Mobile Firmware Hub</h2>
          
          <h3>Our Mission</h3>
          <p>We are dedicated to providing safe, reliable, and comprehensive mobile firmware solutions for Android device enthusiasts worldwide. Our platform serves as a trusted resource for firmware downloads, flashing tools, and educational content.</p>
          
          <h3>What We Offer</h3>
          <div class="services-grid">
            <div class="service-card">
              <h4>Flashing Tools</h4>
              <p>Professional-grade tools for Samsung, Xiaomi, OnePlus, and other Android devices. Including Odin, Mi Flash Tool, and custom utilities.</p>
            </div>
            
            <div class="service-card">
              <h4>Firmware Downloads</h4>
              <p>Official and custom firmware for thousands of Android devices. Stock ROMs, custom ROMs, and recovery images.</p>
            </div>
            
            <div class="service-card">
              <h4>USB Drivers</h4>
              <p>Complete collection of USB drivers for all major Android device brands. Essential for device communication and flashing.</p>
            </div>
            
            <div class="service-card">
              <h4>Educational Content</h4>
              <p>Comprehensive guides, tutorials, and troubleshooting resources to help users safely flash firmware and customize their devices.</p>
            </div>
          </div>
          
          <h3>Our Commitment to Safety</h3>
          <p>We prioritize user safety and device security:</p>
          <ul>
            <li><strong>Verified Sources:</strong> All firmware is sourced from official channels</li>
            <li><strong>Safety Warnings:</strong> Clear warnings about risks and precautions</li>
            <li><strong>Step-by-Step Guides:</strong> Detailed instructions to prevent mistakes</li>
            <li><strong>Community Support:</strong> Active community and technical support</li>
          </ul>
          
          <h3>Device Coverage</h3>
          <p>We support firmware for major Android device brands:</p>
          <ul>
            <li><strong>Samsung:</strong> Galaxy S, Note, A, and other series</li>
            <li><strong>Xiaomi:</strong> Mi, Redmi, POCO, and Black Shark devices</li>
            <li><strong>OnePlus:</strong> Flagship and Nord series devices</li>
            <li><strong>Others:</strong> Huawei, Oppo, Vivo, Realme, and more</li>
          </ul>
          
          <h3>Our Team</h3>
          <p>Our team consists of:</p>
          <ul>
            <li><strong>Android Developers:</strong> Experts in mobile firmware and custom ROMs</li>
            <li><strong>Technical Writers:</strong> Creating clear and comprehensive guides</li>
            <li><strong>Quality Assurance:</strong> Testing and verifying all content</li>
            <li><strong>Support Staff:</strong> Providing technical assistance to users</li>
          </ul>
          
          <h3>Community Impact</h3>
          <p>Since our founding, we have:</p>
          <ul>
            <li>Helped over 1 million users safely flash firmware</li>
            <li>Provided firmware for 10,000+ device models</li>
            <li>Created 500+ educational guides and tutorials</li>
            <li>Built a community of 50,000+ active members</li>
          </ul>
          
          <h3>Contact Information</h3>
          <div class="contact-info">
            <p><strong>General Inquiries:</strong> info@mobilefirmware.com</p>
            <p><strong>Technical Support:</strong> support@mobilefirmware.com</p>
            <p><strong>Partnerships:</strong> partners@mobilefirmware.com</p>
            <p><strong>Phone:</strong> +1 (555) 123-4567</p>
            <p><strong>Address:</strong> 123 Tech Street, Digital City, DC 12345</p>
          </div>
          
          <h3>Follow Us</h3>
          <div class="social-links">
            <a href="#" class="social-link">Twitter</a>
            <a href="#" class="social-link">Facebook</a>
            <a href="#" class="social-link">YouTube</a>
            <a href="#" class="social-link">Telegram</a>
            <a href="#" class="social-link">Discord</a>
          </div>
        </div>
      `,
      layout: 1,
      is_active: 1,
      meta_title: 'About Us - Mobile Firmware Hub',
      meta_keywords: 'about us, mobile firmware, Android flashing, device support',
      meta_description: 'Learn about our mission to provide safe and reliable mobile firmware solutions for Android device enthusiasts worldwide.',
      key: 'about-us'
    },
    {
      slug: 'contact-us',
      title: 'Contact Us',
      description: 'Get in touch with our support team for technical assistance, general inquiries, or partnership opportunities.',
      body: `
        <div class="contact-us">
          <h2>Contact Us</h2>
          <p>We're here to help! Reach out to us for technical support, general inquiries, or any questions about our mobile firmware services.</p>
          
          <div class="contact-methods">
            <div class="contact-method">
              <h3>📧 Email Support</h3>
              <p>For the fastest response, email us directly:</p>
              <ul>
                <li><strong>General Inquiries:</strong> info@mobilefirmware.com</li>
                <li><strong>Technical Support:</strong> support@mobilefirmware.com</li>
                <li><strong>Billing Questions:</strong> billing@mobilefirmware.com</li>
                <li><strong>Partnerships:</strong> partners@mobilefirmware.com</li>
              </ul>
              <p><em>Response time: Usually within 24 hours</em></p>
            </div>
            
            <div class="contact-method">
              <h3>📞 Phone Support</h3>
              <p>Speak directly with our support team:</p>
              <ul>
                <li><strong>Phone:</strong> +1 (555) 123-4567</li>
                <li><strong>Hours:</strong> Monday-Friday, 9 AM - 6 PM EST</li>
                <li><strong>Emergency:</strong> Available 24/7 for critical issues</li>
              </ul>
            </div>
            
            <div class="contact-method">
              <h3>💬 Live Chat</h3>
              <p>Get instant help through our live chat:</p>
              <ul>
                <li>Available on our website</li>
                <li>Real-time technical support</li>
                <li>Screen sharing for complex issues</li>
                <li>Chat history and follow-up emails</li>
              </ul>
            </div>
          </div>
          
          <h3>Support Categories</h3>
          <div class="support-categories">
            <div class="category">
              <h4>🔧 Technical Support</h4>
              <ul>
                <li>Firmware flashing assistance</li>
                <li>Tool installation help</li>
                <li>Device compatibility issues</li>
                <li>Error troubleshooting</li>
              </ul>
            </div>
            
            <div class="category">
              <h4>💳 Account & Billing</h4>
              <ul>
                <li>Account management</li>
                <li>Payment issues</li>
                <li>Subscription changes</li>
                <li>Refund requests</li>
              </ul>
            </div>
            
            <div class="category">
              <h4>📱 Device Support</h4>
              <ul>
                <li>Specific device questions</li>
                <li>Firmware recommendations</li>
                <li>Custom ROM guidance</li>
                <li>Recovery assistance</li>
              </ul>
            </div>
            
            <div class="category">
              <h4>🤝 Partnerships</h4>
              <ul>
                <li>Content partnerships</li>
                <li>Affiliate programs</li>
                <li>Developer collaborations</li>
                <li>Business inquiries</li>
              </ul>
            </div>
          </div>
          
          <h3>Before Contacting Us</h3>
          <p>To help us assist you better, please have ready:</p>
          <ul>
            <li>Your device model and brand</li>
            <li>Android version and build number</li>
            <li>Detailed description of the issue</li>
            <li>Error messages or screenshots</li>
            <li>Steps you've already tried</li>
          </ul>
          
          <h3>Frequently Asked Questions</h3>
          <div class="faq-section">
            <div class="faq-item">
              <h4>Q: How long does it take to get a response?</h4>
              <p>A: We typically respond to emails within 24 hours. Live chat and phone support provide immediate assistance during business hours.</p>
            </div>
            
            <div class="faq-item">
              <h4>Q: Do you provide support for all Android devices?</h4>
              <p>A: We support major brands like Samsung, Xiaomi, OnePlus, and others. Some older or less common devices may have limited support.</p>
            </div>
            
            <div class="faq-item">
              <h4>Q: Is there a charge for technical support?</h4>
              <p>A: Basic support is free for all users. Premium subscribers get priority support and extended assistance.</p>
            </div>
          </div>
          
          <h3>Office Information</h3>
          <div class="office-info">
            <p><strong>Address:</strong> 123 Tech Street, Digital City, DC 12345</p>
            <p><strong>Business Hours:</strong> Monday-Friday, 9 AM - 6 PM EST</p>
            <p><strong>Emergency Support:</strong> Available 24/7 for critical issues</p>
          </div>
          
          <h3>Follow Us</h3>
          <p>Stay connected with us on social media for updates, tips, and community discussions:</p>
          <div class="social-links">
            <a href="#" class="social-link">Twitter</a>
            <a href="#" class="social-link">Facebook</a>
            <a href="#" class="social-link">YouTube</a>
            <a href="#" class="social-link">Telegram</a>
            <a href="#" class="social-link">Discord</a>
          </div>
        </div>
      `,
      layout: 1,
      is_active: 1,
      meta_title: 'Contact Us - Mobile Firmware Support',
      meta_keywords: 'contact us, support, help, mobile firmware, technical assistance',
      meta_description: 'Get in touch with our support team for technical assistance, general inquiries, or partnership opportunities.',
      key: 'contact-us'
    },
    {
      slug: 'faq',
      title: 'Frequently Asked Questions',
      description: 'Find answers to common questions about mobile firmware flashing, tools, and our services.',
      body: `
        <div class="faq">
          <h2>Frequently Asked Questions</h2>
          <p>Find answers to the most common questions about mobile firmware flashing and our services.</p>
          
          <div class="faq-category">
            <h3>🔧 General Questions</h3>
            
            <div class="faq-item">
              <h4>What is mobile firmware?</h4>
              <p>Mobile firmware is the low-level software that controls your device's hardware. It includes the operating system, drivers, and system applications that make your phone work.</p>
            </div>
            
            <div class="faq-item">
              <h4>Why would I need to flash firmware?</h4>
              <p>Common reasons include updating to a newer Android version, fixing software issues, installing custom ROMs, or recovering from a bricked device.</p>
            </div>
            
            <div class="faq-item">
              <h4>Is flashing firmware safe?</h4>
              <p>Flashing firmware can be safe when done correctly, but it carries risks. Always backup your data, use the correct firmware for your device, and follow instructions carefully.</p>
            </div>
            
            <div class="faq-item">
              <h4>Will flashing void my warranty?</h4>
              <p>Yes, flashing custom firmware typically voids your device warranty. However, flashing official firmware usually doesn't affect warranty status.</p>
            </div>
          </div>
          
          <div class="faq-category">
            <h3>📱 Device-Specific Questions</h3>
            
            <div class="faq-item">
              <h4>Which devices do you support?</h4>
              <p>We support major Android brands including Samsung, Xiaomi, OnePlus, Huawei, Oppo, Vivo, and others. Check our device-specific pages for detailed compatibility.</p>
            </div>
            
            <div class="faq-item">
              <h4>How do I find the right firmware for my device?</h4>
              <p>Use your device's model number (found in Settings > About Phone) to search for the correct firmware. Always match the exact model number and region.</p>
            </div>
            
            <div class="faq-item">
              <h4>Can I flash firmware from a different region?</h4>
              <p>Generally yes, but it may affect network compatibility and warranty. Some devices have region locks that prevent cross-region flashing.</p>
            </div>
            
            <div class="faq-item">
              <h4>What's the difference between stock ROM and custom ROM?</h4>
              <p>Stock ROM is the official firmware from the device manufacturer. Custom ROM is modified firmware created by developers, often with additional features and customization options.</p>
            </div>
          </div>
          
          <div class="faq-category">
            <h3>🛠️ Technical Questions</h3>
            
            <div class="faq-item">
              <h4>What tools do I need for flashing?</h4>
              <p>You'll need device-specific tools (like Odin for Samsung, Mi Flash Tool for Xiaomi), USB drivers, and sometimes ADB/Fastboot tools.</p>
            </div>
            
            <div class="faq-item">
              <h4>How do I install USB drivers?</h4>
              <p>Download the appropriate drivers for your device brand, extract the files, and install them on your computer. Our USB Drivers page has detailed instructions.</p>
            </div>
            
            <div class="faq-item">
              <h4>What is bootloader unlocking?</h4>
              <p>Bootloader unlocking allows you to install custom firmware. The process varies by device - some require official unlocking tools, others use fastboot commands.</p>
            </div>
            
            <div class="faq-item">
              <h4>My device is stuck in boot loop. How do I fix it?</h4>
              <p>Try entering recovery mode and performing a factory reset. If that doesn't work, you may need to re-flash the firmware using emergency recovery tools.</p>
            </div>
          </div>
          
          <div class="faq-category">
            <h3>💳 Account & Payment Questions</h3>
            
            <div class="faq-item">
              <h4>Do I need an account to download firmware?</h4>
              <p>Some firmware files require a free account, while premium content requires a subscription. Creating an account also gives you access to download history and support.</p>
            </div>
            
            <div class="faq-item">
              <h4>What payment methods do you accept?</h4>
              <p>We accept major credit cards, PayPal, cryptocurrency, and various regional payment methods depending on your location.</p>
            </div>
            
            <div class="faq-item">
              <h4>Can I cancel my subscription?</h4>
              <p>Yes, you can cancel your subscription at any time from your account settings. You'll continue to have access until the end of your current billing period.</p>
            </div>
            
            <div class="faq-item">
              <h4>Do you offer refunds?</h4>
              <p>We offer refunds within 30 days for unused subscriptions. Refunds for downloaded content are handled on a case-by-case basis.</p>
            </div>
          </div>
          
          <div class="faq-category">
            <h3>🚨 Troubleshooting</h3>
            
            <div class="faq-item">
              <h4>My device won't connect to the computer. What should I do?</h4>
              <p>Check that USB drivers are installed, try a different USB cable or port, enable USB debugging, and ensure your device is in the correct mode (Download/Fastboot).</p>
            </div>
            
            <div class="faq-item">
              <h4>The flashing process failed. What now?</h4>
              <p>Don't panic. Try the process again with a fresh download, check that you're using the correct firmware, and ensure your device has sufficient battery (at least 50%).</p>
            </div>
            
            <div class="faq-item">
              <h4>I can't find firmware for my device. What should I do?</h4>
              <p>Some newer or less common devices may not have firmware available immediately. Contact our support team - we may be able to help locate or add support for your device.</p>
            </div>
            
            <div class="faq-item">
              <h4>My device is completely dead (hard brick). Can it be fixed?</h4>
              <p>Many "hard bricked" devices can be recovered using emergency download modes and special tools. Contact our support team for device-specific recovery instructions.</p>
            </div>
          </div>
          
          <div class="contact-support">
            <h3>Still Need Help?</h3>
            <p>If you can't find the answer to your question, our support team is here to help:</p>
            <ul>
              <li><strong>Email:</strong> support@mobilefirmware.com</li>
              <li><strong>Live Chat:</strong> Available on our website</li>
              <li><strong>Phone:</strong> +1 (555) 123-4567</li>
            </ul>
          </div>
        </div>
      `,
      layout: 1,
      is_active: 1,
      meta_title: 'FAQ - Mobile Firmware Questions & Answers',
      meta_keywords: 'FAQ, frequently asked questions, mobile firmware, flashing help, troubleshooting',
      meta_description: 'Find answers to common questions about mobile firmware flashing, tools, and our services.',
      key: 'faq'
    }
  ];

  // Insert pages
  for (const page of pages) {
    await knex('res_pages').insert(page);
  }

  console.log(`📄 Created ${pages.length} pages!`);
  console.log(`📊 Pages created:`);
  pages.forEach((page, index) => {
    console.log(`   ${index + 1}. ${page.title} (/${page.slug})`);
  });
  
  console.log(`\n📋 Page Categories:`);
  console.log(`   🔧 Technical Pages: 5 (Firmware guides and download centers)`);
  console.log(`   📄 Legal Pages: 2 (Privacy Policy, Terms of Service)`);
  console.log(`   ℹ️  Info Pages: 3 (About Us, Contact Us, FAQ)`);
  console.log(`\n📱 Mobile Firmware Website Pages Created Successfully!`);
};
