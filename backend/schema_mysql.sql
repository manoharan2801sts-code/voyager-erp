-- ============================================================================
-- Accounting Software Live - MySQL 8.0 Schema
-- Converted from MS SQL Server to MySQL
-- Database: accounting_db
-- ============================================================================

USE `accounting_db`;

SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- Table: Ledger_Groups
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Ledger_Groups` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `company_id` INT NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(20) NULL,
    `account_type` VARCHAR(20) NOT NULL,
    `parent_id` INT NULL,
    `is_group` TINYINT(1) NOT NULL DEFAULT 1,
    `is_system` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX `ix_ledger_groups_company_id` (`company_id`),
    INDEX `ix_ledger_groups_parent_id` (`parent_id`),
    CONSTRAINT `fk_ledger_groups_parent` FOREIGN KEY (`parent_id`) 
        REFERENCES `Ledger_Groups` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `uq_ledger_groups_company_parent_name` 
        UNIQUE (`company_id`, `parent_id`, `name`),
    CONSTRAINT `ck_ledger_groups_account_type` 
        CHECK (`account_type` IN ('EQUITY', 'EXPENSE', 'INCOME', 'LIABILITY', 'ASSET'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: Ledgers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Ledgers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `company_id` INT NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `group_id` INT NOT NULL,
    `account_type` VARCHAR(20) NOT NULL,
    `ledger_category` VARCHAR(20) NOT NULL,
    `opening_balance` DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    `opening_balance_type` VARCHAR(10) NOT NULL DEFAULT 'Debit',
    `bank_account_no` VARCHAR(40) NULL,
    `bank_branch` VARCHAR(100) NULL,
    `ifsc_code` VARCHAR(15) NULL,
    `swift_code` VARCHAR(15) NULL,
    `alias_name` VARCHAR(100) NULL,
    `address_line1` VARCHAR(150) NULL,
    `address_line2` VARCHAR(150) NULL,
    `agent_id` VARCHAR(30) NULL,
    `city` VARCHAR(60) NULL,
    `pincode` VARCHAR(10) NULL,
    `state_name` VARCHAR(60) NULL,
    `gst_no` VARCHAR(20) NULL,
    `gst_registration_type` VARCHAR(20) NULL,
    `pan_no` VARCHAR(15) NULL,
    `emirate` VARCHAR(30) NULL,
    `po_box_no` VARCHAR(20) NULL,
    `vat_trn_no` VARCHAR(20) NULL,
    `trade_license_no` VARCHAR(30) NULL,
    `trade_license_expiry` DATE NULL,
    `creditor_type` VARCHAR(30) NULL,
    `airline_code` VARCHAR(3) NULL,
    `supplier_code` VARCHAR(30) NULL,
    `office_id` VARCHAR(30) NULL,
    `tax_category` VARCHAR(10) NULL,
    `tax_type` VARCHAR(10) NULL,
    `gst_applicable` TINYINT(1) NOT NULL DEFAULT 0,
    `gst_tax_type` VARCHAR(10) NULL,
    `gst_percentage` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `tds_applicable` TINYINT(1) NOT NULL DEFAULT 0,
    `tds_percentage` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `hsn_code` VARCHAR(15) NULL,
    `tcs_applicable` TINYINT(1) NOT NULL DEFAULT 0,
    `tcs_percentage` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `is_system` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    `maintain_balance_bill_wise` VARCHAR(5) NULL,
    `place_of_supply` VARCHAR(60) NULL,
    INDEX `ix_ledgers_company_id` (`company_id`),
    INDEX `ix_ledgers_group_id` (`group_id`),
    CONSTRAINT `fk_ledgers_group` FOREIGN KEY (`group_id`) 
        REFERENCES `Ledger_Groups` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `uq_ledgers_company_name` 
        UNIQUE (`company_id`, `name`),
    CONSTRAINT `ck_ledgers_balance_type` 
        CHECK (`opening_balance_type` IN ('Credit', 'Debit'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: Tickets
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Tickets` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `company_id` INT NOT NULL,
    `branch_name` VARCHAR(100) NULL,
    `invoice_number` VARCHAR(20) NOT NULL,
    `invoice_date` DATE NOT NULL,
    `invoice_type` VARCHAR(20) NULL,
    `booking_mode` VARCHAR(20) NOT NULL DEFAULT 'Manual',
    `booking_type` VARCHAR(30) NULL,
    `booking_status` VARCHAR(20) NULL,
    `customer_ledger_id` INT NOT NULL,
    `supplier_ledger_id` INT NULL,
    `travel_type` VARCHAR(20) NULL,
    `user_name` VARCHAR(100) NULL,
    `currency` VARCHAR(5) NOT NULL DEFAULT 'INR',
    `roe` DECIMAL(10, 4) NOT NULL DEFAULT 1.0000,
    `booking_given_by` VARCHAR(25) NULL,
    `booking_reference` VARCHAR(30) NOT NULL,
    `booking_ref_date` DATE NULL,
    `airline_pnr` VARCHAR(13) NULL,
    `gds_pnr` VARCHAR(13) NULL,
    `office_id` VARCHAR(30) NULL,
    `payment_mode` VARCHAR(20) NULL,
    `airline_category` VARCHAR(5) NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX `ix_tickets_company_id` (`company_id`),
    INDEX `ix_tickets_customer_ledger_id` (`customer_ledger_id`),
    INDEX `ix_tickets_supplier_ledger_id` (`supplier_ledger_id`),
    CONSTRAINT `fk_tickets_customer` FOREIGN KEY (`customer_ledger_id`) 
        REFERENCES `Ledgers` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_tickets_supplier` FOREIGN KEY (`supplier_ledger_id`) 
        REFERENCES `Ledgers` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `uq_tickets_company_booking_ref` 
        UNIQUE (`company_id`, `booking_reference`),
    CONSTRAINT `uq_tickets_company_invoice_no` 
        UNIQUE (`company_id`, `invoice_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: TicketLines
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `TicketLines` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `ticket_id` INT NOT NULL,
    `airline_code` VARCHAR(3) NULL,
    `airline_name` VARCHAR(60) NULL,
    `flight_no` VARCHAR(15) NULL,
    `ticket_no` VARCHAR(30) NOT NULL,
    `passenger_name` VARCHAR(30) NOT NULL,
    `pax_type` VARCHAR(10) NOT NULL DEFAULT 'Adult',
    `sector` VARCHAR(40) NULL,
    `travel_date` DATE NULL,
    `basic_fare` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    `yq` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    `yr` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    `k3_tax` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    `tax_others` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    `seat` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    `meal` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    `baggage` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    `other_ssr` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    `disc_on` VARCHAR(20) NULL,
    `disc_type` VARCHAR(12) NULL,
    `disc_value` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    `tds_per` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `markup` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    `addl_markup` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    `service_fee` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    `addl_service_fee` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    `gst_pct` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    `total_billed` DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    `status` VARCHAR(15) NOT NULL DEFAULT 'ISSUED',
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY `uq_ticketlines_ticket_no` (`ticket_no`),
    INDEX `ix_ticketlines_ticket_id` (`ticket_id`),
    CONSTRAINT `fk_ticketlines_ticket` FOREIGN KEY (`ticket_id`) 
        REFERENCES `Tickets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------------------------------
-- Seed Data: Standard Chart of Accounts Ledger_Groups (Company 1 & Company 2)
-- ----------------------------------------------------------------------------
DELIMITER $$
DROP PROCEDURE IF EXISTS `SeedLedgerGroupsForCompany`$$
CREATE PROCEDURE `SeedLedgerGroupsForCompany`(IN p_company_id INT)
BEGIN
    -- Level 1: Primary Natures
    INSERT IGNORE INTO `Ledger_Groups` (`company_id`, `name`, `code`, `account_type`, `parent_id`, `is_group`, `is_system`)
    VALUES
        (p_company_id, 'Assets',      '1000', 'ASSET',     NULL, 1, 1),
        (p_company_id, 'Liabilities', '2000', 'LIABILITY', NULL, 1, 1),
        (p_company_id, 'Income',      '4000', 'INCOME',    NULL, 1, 1),
        (p_company_id, 'Expenses',    '5000', 'EXPENSE',   NULL, 1, 1);

    -- Level 2: Primary Groups
    INSERT IGNORE INTO `Ledger_Groups` (`company_id`, `name`, `code`, `account_type`, `parent_id`, `is_group`, `is_system`)
    SELECT p_company_id, v.name, v.code, v.account_type, p.id, 1, 1
    FROM (
        SELECT 'Capital Account' AS name, '2100' AS code, 'LIABILITY' AS account_type, '2000' AS parent_code UNION ALL
        SELECT 'Loans (Liability)', '2200', 'LIABILITY', '2000' UNION ALL
        SELECT 'Current Liabilities', '2300', 'LIABILITY', '2000' UNION ALL
        SELECT 'Fixed Assets', '1100', 'ASSET', '1000' UNION ALL
        SELECT 'Investments', '1200', 'ASSET', '1000' UNION ALL
        SELECT 'Current Assets', '1300', 'ASSET', '1000' UNION ALL
        SELECT 'Sales Accounts', '4100', 'INCOME', '4000' UNION ALL
        SELECT 'Direct Income', '4200', 'INCOME', '4000' UNION ALL
        SELECT 'Indirect Income', '4300', 'INCOME', '4000' UNION ALL
        SELECT 'Purchase Accounts', '5100', 'EXPENSE', '5000' UNION ALL
        SELECT 'Direct Expenses', '5200', 'EXPENSE', '5000' UNION ALL
        SELECT 'Indirect Expenses', '5300', 'EXPENSE', '5000'
    ) AS v
    INNER JOIN `Ledger_Groups` p ON p.company_id = p_company_id AND p.code = v.parent_code;

    -- Level 3: Sub-groups
    INSERT IGNORE INTO `Ledger_Groups` (`company_id`, `name`, `code`, `account_type`, `parent_id`, `is_group`, `is_system`)
    SELECT p_company_id, v.name, v.code, v.account_type, p.id, 1, 1
    FROM (
        SELECT 'Secured Loans' AS name, '2210' AS code, 'LIABILITY' AS account_type, '2200' AS parent_code UNION ALL
        SELECT 'Unsecured Loans', '2220', 'LIABILITY', '2200' UNION ALL
        SELECT 'Sundry Creditors', '2310', 'LIABILITY', '2300' UNION ALL
        SELECT 'Duties & Taxes', '2320', 'LIABILITY', '2300' UNION ALL
        SELECT 'Provisions', '2330', 'LIABILITY', '2300' UNION ALL
        SELECT 'Sundry Debtors', '1310', 'ASSET', '1300' UNION ALL
        SELECT 'Bank Accounts', '1320', 'ASSET', '1300' UNION ALL
        SELECT 'Cash-in-hand', '1330', 'ASSET', '1300' UNION ALL
        SELECT 'Deposits (Asset)', '1340', 'ASSET', '1300' UNION ALL
        SELECT 'Stock-in-hand', '1350', 'ASSET', '1300' UNION ALL
        SELECT 'Tax Assets', '1360', 'ASSET', '1300'
    ) AS v
    INNER JOIN `Ledger_Groups` p ON p.company_id = p_company_id AND p.code = v.parent_code;
END$$

DELIMITER ;

CALL `SeedLedgerGroupsForCompany`(1);
CALL `SeedLedgerGroupsForCompany`(2);

DROP PROCEDURE IF EXISTS `SeedLedgerGroupsForCompany`;
