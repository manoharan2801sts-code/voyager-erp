/**
 * Voyager ERP — Hardcoded UI/Reference Data
 * ------------------------------------------------------------------
 * SINGLE source for hardcoded, non-business-transactional data:
 * sidebar/menu structure, status pill tone mapping, dashboard KPI
 * card definitions, and loader copy.
 *
 * This is separate from mock-data.js (VoyagerMock), which simulates
 * the API layer (records + CRUD) for demo/offline mode — that stays
 * where it is since it's mock business logic, not display config.
 *
 * Loaded before shell.js, util.js and dashboard.js in every page —
 * those files now read from window.VoyagerHardcode instead of
 * defining their own copies. Nothing about how they fetch, compute,
 * or render data has changed — only where the label/icon/status
 * strings come from.
 * ------------------------------------------------------------------
 */
(function (window) {

  // Sidebar + top pulldown menu structure.
  // Moved out of shell.js (was: local NAV_SECTIONS).
  const NAV_SECTIONS = [
    { label: "Overview", items: [
      { key: "dashboard", label: "CFO Dashboard", href: "dashboard.html", icon: "M3 3v9h7V3H3zm11 0v5h7V3h-7zm0 9v9h7v-9h-7zM3 16v6h7v-6H3z" },
    ]},
    { label: "Sales", items: [
      { key: "tickets", label: "Airline Tickets", href: "tickets.html", icon: "M2 16l20-8-8 20-2-8-8-2z" },
      { key: "hotels", label: "Hotels", href: "hotels.html", icon: "M3 21V8l9-5 9 5v13M9 21v-6h6v6" },
      { key: "visa", label: "Visa", href: "visa.html", icon: "M3 4h18v16H3zM8 2v4M16 2v4M3 10h18" },
      { key: "insurance", label: "Insurance", href: "insurance.html", icon: "M12 22s8-4.5 8-11V5l-8-3-8 3v6c0 6.5 8 11 8 11z" },
      { key: "tours", label: "Tour Packages", href: "tours.html", icon: "M12 22s8-4.5 8-11V5l-8-3-8 3v6c0 6.5 8 11 8 11z" },
    ]},
    { label: "Accounting", items: [
      { key: "accounts", label: "Chart of Accounts", href: "accounts.html", icon: "M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" },
      { key: "groups", label: "Account Groups", href: "groups.html", icon: "M3 3h18v6H3zM3 15h18v6H3zM3 9h18v6H3z" },
      { key: "vouchers", label: "Vouchers & Journal", href: "vouchers.html", icon: "M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5z" },
      { key: "customers", label: "Receivables (AR)", href: "customers.html", icon: "M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" },
      { key: "suppliers", label: "Payables (AP)", href: "suppliers.html", icon: "M1 4h22v16H1zM1 10h22" },
    ]},
    { label: "Reports & Compliance", items: [
      { key: "reports", label: "Trial Balance", href: "reports.html", icon: "M9 17V9M14 17V5M4 17v-3M3 21h18" },
      { key: "tax", label: "GST / TDS / VAT", href: "tax.html", icon: "M19 21l-7-4-7 4V5a2 2 0 012-2h10a2 2 0 012 2z" },
      { key: "mis", label: "MIS & Analytics", href: "#", phase2: true, icon: "M3 3v18h18M7 15l4-6 4 3 5-8" },
    ]},
    { label: "Admin", items: [
      { key: "users", label: "Users & Roles", href: "#", phase2: true, icon: "M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M1 21v-2a4 4 0 013-3.87" },
    ]},
  ];

  // Voucher/record status → pill tone. Moved out of util.js
  // (was: local STATUS_MAP inside statusPill()).
  const STATUS_MAP = {
    ISSUED: "success", CONFIRMED: "success", APPROVED: "success", ACTIVE: "success", DEDUCTED: "success",
    SUBMITTED: "warning", PENDING: "warning", RECONCILED: "warning",
    REFUNDED: "danger", VOID: "danger", CANCELLED: "danger", REJECTED: "danger", CLAIMED: "warning",
  };

  // Dashboard hero row (top 3 boarding-pass cards).
  // Moved out of dashboard.js (was: 3 hardcoded heroCard(...) calls).
  // iconKey refers to an entry in ICONS below.
  const DASHBOARD_HERO_CARDS = [
    { label: "Today's Sales", dataPath: "sales.today_sales", iconKey: "calendar" },
    { label: "Month Sales",   dataPath: "sales.month_sales",  iconKey: "plane" },
    { label: "YTD Sales",     dataPath: "sales.ytd_sales",    iconKey: "trend" },
  ];

  // Revenue-by-product-line tiles. Moved out of dashboard.js.
  const DASHBOARD_REVENUE_TILES = [
    { label: "Ticket Revenue",     dataPath: "revenue.ticket_revenue",     ledger: "Ticket Sales Revenue" },
    { label: "Hotel Revenue",      dataPath: "revenue.hotel_revenue",      ledger: "Hotel Sales Revenue" },
    { label: "Visa Revenue",       dataPath: "revenue.visa_revenue",       ledger: "Visa Service Revenue" },
    { label: "Insurance Revenue",  dataPath: "revenue.insurance_revenue",  ledger: "Insurance Revenue" },
    { label: "Service Charges",    dataPath: "revenue.service_charges",    ledger: null },
    { label: "Markup Revenue",     dataPath: "revenue.markup_revenue",     ledger: null },
  ];

  // Finance position tiles. Moved out of dashboard.js.
  const DASHBOARD_FINANCE_TILES = [
    { label: "Cash Position",              dataPath: "finance.cash_position",              ledger: "Cash in Hand" },
    { label: "Bank Position",              dataPath: "finance.bank_position",              ledger: "Bank Account - Main" },
    { label: "Outstanding Receivables",    dataPath: "finance.outstanding_receivables",    ledger: "Trade Receivable" },
    { label: "Outstanding Payables",       dataPath: "finance.outstanding_payables",       ledger: "Trade Payable - Suppliers" },
  ];

  // Shared icon paths (24x24 stroke icons), keyed for reuse across dashboard cards.
  const ICONS = {
    plane:    "M2 16l20-8-8 20-2-8-8-2z",
    calendar: "M3 4h18v16H3zM8 2v4M16 2v4M3 10h18",
    trend:    "M23 6l-9.5 9.5-5-5L1 18",
    logout:   "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
    search:   "M11 11m-7 0a7 7 0 1014 0 7 7 0 10-14 0",
    bell:     "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9",
  };

  // Loader copy shown per context — used with VoyagerLoader.show(...)
  const LOADER_MESSAGES = {
    dashboard: "Building your dashboard…",
    ledger:    "Fetching ledger entries…",
    voucher:   "Preparing voucher…",
    report:    "Compiling report…",
    default:   "Loading…",
  };

  // Currency / number formatting config (Indian numbering system per spec)
  const NUMBER_FORMAT = {
    locale: "en-IN",
    currency: "INR",
    currencySymbol: "₹",
  };

  // Airline Ticket entry form — dropdown option lists, straight from the
  // "TeSePr Accounting Software" field spec (Airline Ticket sheet, Part 1-3).
  // Kept here (not inline in the HTML) so this is the one place to edit them.
  const TICKET_FORM_OPTIONS = {
    invoiceTypes: ["Tax Invoice", "Others"],
    bookingModes: ["Manual", "Auto Push"],
    // Locked to this until the real API push is connected — see bookingModes above
    // for the full list this will switch back to being a dropdown of, later.
    defaultBookingMode: "Manual",
    bookingTypes: [
      "Travel Desk", "Indesk", "Agent", "Retrieve PNR Accounting",
      "Manual Booking", "Mobile Booking", "Travel Co-Ordinator", "SSR Updation",
    ],
    bookingStatuses: ["Confirmed", "Re-Scheduled"],
    travelTypes: ["Domestic", "International"],
    currencies: ["INR", "AED"],
    custDiscountOn: ["Basic", "Basic + YQ", "Basic + YR", "Basic + YQ + YR", "Gross"],
    custDiscountTypes: ["Percentage", "Flat"],
    paxTypes: ["Adult", "Child", "Infant"],
    paymentModes: ["Top-up", "Payment Gateway"],
    airlineCategories: ["LCC", "FSC", "OSC"],
    // Placeholder until a real User Master exists — spec calls for a searchable
    // user dropdown backed by "User Master", not yet a separate module here.
    userNames: ["Ananya Krishnan", "Rahul Mehta", "Fatima Al Suwaidi", "Vikram Iyer"],
  };

  window.VoyagerHardcode = {
    NAV_SECTIONS,
    STATUS_MAP,
    DASHBOARD_HERO_CARDS,
    DASHBOARD_REVENUE_TILES,
    DASHBOARD_FINANCE_TILES,
    ICONS,
    LOADER_MESSAGES,
    NUMBER_FORMAT,
    TICKET_FORM_OPTIONS,
  };
})(window);