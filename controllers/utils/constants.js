// Period units in seconds
const PERIOD_UNITS_IN_SECONDS = {
  seconds: 1,
  minutes: 60,
  hours: 60 * 60,
  days: 60 * 60 * 24,
  weeks: 60 * 60 * 24 * 7,
  months: 60 * 60 * 24 * 30,
  years: 60 * 60 * 24 * 365,
};

// Bandwidth units in bytes
const BANDWIDTH_UNITS_IN_BYTES = {
  Bytes: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
};

const ITEM_TYPE = {
  1: "Digital Files",
  2: "Subscription Package",
  3: "Digital Product",
  4: "Courses",
  5: "Wallet Recharge",
  6: "Physical Product",
  7: "Service Booking",
};

const PRODUCT_TYPE = {
  1: "Physical",
  2: "Digital",
};

const PRODUCT_STATUS = {
  1: "Draft",
  2: "Active",
  3: "Inactive",
  4: "Archived",
};

const PAYMENT_STATUS = {
  1: "Pending",
  2: "Paid",
  3: "Failed",
  4: "Refunded",
};

const PAYMENT_METHOD = {
  1: "Razorpay",
  2: "Manual",
  3: "Account Balance",
  4: "Binance",
  5: "Cashfree",
  6: "PayPal",
  7: "INR Portal",
  8: "Coin Flex Pay",
  9: "Free Order (100% Discount)",
};


const ORDER_STATUS = {
  1: "Pending", // Order placed but no further action yet.
  2: "Accepted", // Order accepted by the seller.
  3: "Processing", // Order is being prepared (packing or generating access).
  4: "Shipped", // For physical products: Order dispatched.
  5: "Out for Delivery", // For physical products: Out for final delivery.
  6: "Delivered", // Order successfully delivered to the customer.
  7: "Completed", // Order completed and closed.
  8: "Cancelled", // Order was cancelled by the customer or seller.
  9: "Returned", // Physical product returned by the customer.
  10: "Refunded", // Order payment refunded to the customer.
  11: "Partially Fulfilled", // Only part of the order was fulfilled.
  12: "On Hold", // Order is paused pending some action.
};

const SEARCH_TYPE = {
  WEBSITE: "0",
  PRODUCTS: "1",
  CATEGORIES: "2",
  FILES: "3",
  FOLDERS: "4",
  BLOGS: "5",
};

const COURSE_DURATION_TYPE = {
  1: "Single Validity",
  2: "Lifetime Validity",
  3: "Course Expiry Date",
};

const USER_TYPES = {
  1 : "Customer",
  2 : "Admin"
}

const NOTIFICATION_TYPES = {
  user_signup: "User Signup",
  order_placed: "Order Placed",
  payment_received: "Payment Received",
  download_complete: "Download Complete",
  file_request: "File Request",
  system_alert: "System Alert"
};

const PAGES =  [
  {
    "title": "Home",
    "slug": ""
  },
  {
    "title": "Packages & Pricing",
    "slug": "downloads-package"
  },
  {
    "title": "Recent Files",
    "slug": "recent-files"
  },
  {
    "title": "Request File",
    "slug": "request-file"
  },
  {
    "title": "Contact Us",
    "slug": "contact-us"
  },
  {
    "title": "Our Agents",
    "slug": "our-agents"
  },
  {
    "title": "Our Teams",
    "slug": "our-teams"
  },
  {
    "title": "Blogs",
    "slug": "blogs"
  },
  {
    "title": "Free Files",
    "slug": "free-files"
  },
  {
    "title": "Paid Files",
    "slug": "paid-files"
  },
  {
    "title": "About Us",
    "slug": "about-us"
  },
  {
    "title": "Login",
    "slug": "auth/login"
  },
  {
    "title": "Sign Up",
    "slug": "auth/signup"
  },
  {
    "title": "Forgot Password",
    "slug": "auth/forgot-password"
  },
];

const STATIC_PAGES = [
  {
    "title": "Home",
    "slug": ""
  },
  {
    "title": "Packages & Pricing",
    "slug": "downloads-package"
  },
  {
    "title": "Recent Files",
    "slug": "recent-files"
  },
  {
    "title": "Request File",
    "slug": "request-file"
  },
  {
    "title": "Contact Us",
    "slug": "contact-us"
  },
  {
    "title": "Our Agents",
    "slug": "our-agents"
  },
  {
    "title": "Our Teams",
    "slug": "our-teams"
  },
  {
    "title": "Blogs",
    "slug": "blogs"
  },
  {
    "title": "Free Files",
    "slug": "free-files"
  },
  {
    "title": "Paid Files",
    "slug": "paid-files"
  },
  {
    "title": "About Us",
    "slug": "about-us"
  },
  {
    "title": "Login",
    "slug": "auth/login"
  },
  {
    "title": "Sign Up",
    "slug": "auth/signup"
  },
  {
    "title": "Forgot Password",
    "slug": "auth/forgot-password"
  },
]

module.exports = {
  PERIOD_UNITS_IN_SECONDS,
  BANDWIDTH_UNITS_IN_BYTES,
  ITEM_TYPE,
  PAYMENT_STATUS,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PRODUCT_TYPE,
  PRODUCT_STATUS,
  SEARCH_TYPE,
  COURSE_DURATION_TYPE,
  USER_TYPES,
  NOTIFICATION_TYPES,
  PAGES,
  STATIC_PAGES
};


