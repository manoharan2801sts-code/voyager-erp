/* ==========================================================================
   Voyager ERP — Ledger_Groups full schema
   Creates the database, the table, and inserts every group that used
   to be hardcoded in the frontend's mock-data.js (COA_DEFS array) —
   27 rows total, 4 top-level natures + their sub-groups, matching the
   Chart of Accounts hierarchy the UI already shows.

   Run this whole file once, top to bottom, in SQL Server Management
   Studio (or sqlcmd). It is safe to re-run — it drops and recreates
   the database each time (see the DROP DATABASE section) so you don't
   end up with duplicate rows from running it twice.
   ========================================================================== */

-- --------------------------------------------------------------------------
-- 1. Database
-- --------------------------------------------------------------------------
USE master;
GO

IF EXISTS (SELECT name FROM sys.databases WHERE name = N'Accounting_DB')
BEGIN
    ALTER DATABASE Accounting_DB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE Accounting_DB;
END
GO

CREATE DATABASE Accounting_DB;
GO

USE Accounting_DB;
GO

-- --------------------------------------------------------------------------
-- 2. Table
-- --------------------------------------------------------------------------
CREATE TABLE Ledger_Groups (
    id              INT IDENTITY(1,1) PRIMARY KEY,

    company_id      INT NOT NULL,

    name            NVARCHAR(100) NOT NULL,
    code            NVARCHAR(20)  NULL,

    account_type    NVARCHAR(20)  NOT NULL
        CONSTRAINT ck_ledger_groups_account_type
        CHECK (account_type IN ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY')),

    parent_id       INT NULL,

    is_group        BIT NOT NULL DEFAULT 1,
    is_system       BIT NOT NULL DEFAULT 0,

    created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT fk_ledger_groups_parent
        FOREIGN KEY (parent_id) REFERENCES Ledger_Groups(id)
        ON DELETE NO ACTION,

    CONSTRAINT uq_ledger_groups_company_parent_name
        UNIQUE (company_id, parent_id, name)
);
GO

CREATE INDEX ix_ledger_groups_company_id ON Ledger_Groups(company_id);
CREATE INDEX ix_ledger_groups_parent_id  ON Ledger_Groups(parent_id);
GO

CREATE TRIGGER trg_ledger_groups_updated_at
ON Ledger_Groups
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE lg
    SET updated_at = SYSUTCDATETIME()
    FROM Ledger_Groups lg
    INNER JOIN inserted i ON lg.id = i.id;
END;
GO

-- --------------------------------------------------------------------------
-- 3. Seed data — every group from the old hardcoded COA_DEFS array,
--    inserted level-by-level (top-level first) so parent_id can be
--    looked up by code via subquery instead of guessing IDENTITY values.
--    Runs for BOTH demo companies (1 = Voyager Travel India, 2 = Al
--    Maha Trading / UAE), matching the two-company setup already in
--    the frontend's company selector.
-- --------------------------------------------------------------------------
DECLARE @company_id INT;
DECLARE company_cursor CURSOR FOR SELECT v FROM (VALUES (1), (2)) AS t(v);
OPEN company_cursor;
FETCH NEXT FROM company_cursor INTO @company_id;

WHILE @@FETCH_STATUS = 0
BEGIN
    -- Level 1 — top-level natures
    INSERT INTO Ledger_Groups (company_id, name, code, account_type, parent_id, is_group, is_system) VALUES
        (@company_id, N'Assets',      N'1000', N'ASSET',     NULL, 1, 1),
        (@company_id, N'Liabilities', N'2000', N'LIABILITY', NULL, 1, 1),
        (@company_id, N'Income',      N'4000', N'INCOME',    NULL, 1, 1),
        (@company_id, N'Expenses',    N'5000', N'EXPENSE',   NULL, 1, 1);

    -- Level 2 — primary groups (parent looked up by code within this company)
    INSERT INTO Ledger_Groups (company_id, name, code, account_type, parent_id, is_group, is_system)
    SELECT @company_id, v.name, v.code, v.account_type, p.id, 1, 1
    FROM (VALUES
        (N'Capital Account',     N'2100', N'LIABILITY', N'2000'),
        (N'Loans (Liability)',   N'2200', N'LIABILITY', N'2000'),
        (N'Current Liabilities', N'2300', N'LIABILITY', N'2000'),
        (N'Fixed Assets',        N'1100', N'ASSET',     N'1000'),
        (N'Investments',         N'1200', N'ASSET',     N'1000'),
        (N'Current Assets',      N'1300', N'ASSET',     N'1000'),
        (N'Sales Accounts',      N'4100', N'INCOME',    N'4000'),
        (N'Direct Income',       N'4200', N'INCOME',    N'4000'),
        (N'Indirect Income',     N'4300', N'INCOME',    N'4000'),
        (N'Purchase Accounts',   N'5100', N'EXPENSE',   N'5000'),
        (N'Direct Expenses',     N'5200', N'EXPENSE',   N'5000'),
        (N'Indirect Expenses',   N'5300', N'EXPENSE',   N'5000')
    ) AS v(name, code, account_type, parent_code)
    INNER JOIN Ledger_Groups p ON p.company_id = @company_id AND p.code = v.parent_code;

    -- Level 3 — sub-groups
    INSERT INTO Ledger_Groups (company_id, name, code, account_type, parent_id, is_group, is_system)
    SELECT @company_id, v.name, v.code, v.account_type, p.id, 1, 1
    FROM (VALUES
        (N'Secured Loans',    N'2210', N'LIABILITY', N'2200'),
        (N'Unsecured Loans',  N'2220', N'LIABILITY', N'2200'),
        (N'Sundry Creditors', N'2310', N'LIABILITY', N'2300'),
        (N'Duties & Taxes',   N'2320', N'LIABILITY', N'2300'),
        (N'Provisions',       N'2330', N'LIABILITY', N'2300'),
        (N'Sundry Debtors',   N'1310', N'ASSET',     N'1300'),
        (N'Bank Accounts',    N'1320', N'ASSET',     N'1300'),
        (N'Cash-in-hand',     N'1330', N'ASSET',     N'1300'),
        (N'Deposits (Asset)', N'1340', N'ASSET',     N'1300'),
        (N'Stock-in-hand',    N'1350', N'ASSET',     N'1300'),
        (N'Tax Assets',       N'1360', N'ASSET',     N'1300')
    ) AS v(name, code, account_type, parent_code)
    INNER JOIN Ledger_Groups p ON p.company_id = @company_id AND p.code = v.parent_code;

    FETCH NEXT FROM company_cursor INTO @company_id;
END

CLOSE company_cursor;
DEALLOCATE company_cursor;
GO

-- --------------------------------------------------------------------------
-- 4. Quick sanity check — should return 27 groups per company (54 total)
-- --------------------------------------------------------------------------
SELECT company_id, COUNT(*) AS group_count FROM Ledger_Groups GROUP BY company_id;
GO