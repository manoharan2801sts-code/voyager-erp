"""
Ledger_Groups — Django model
-----------------------------------------------------------------
Stores the Chart of Accounts GROUP hierarchy only (Assets, Current
Assets, Sundry Debtors, etc.) — not individual ledgers. This mirrors
what's shown under "Chart of Accounts" in the UI: a tree of group
nodes, each optionally nested under a parent group.

Requires a Django MSSQL backend, since Django has no native MSSQL
driver. Install and configure ONE of:
    pip install mssql-django      (actively maintained, recommended)
    pip install django-pyodbc-azure
and set ENGINE = "mssql" in settings.py DATABASES, plus a working
ODBC Driver 17/18 for SQL Server installed on the machine running
Django.

Usage once wired into an app (e.g. `accounting`):
    python manage.py makemigrations accounting
    python manage.py migrate accounting
Since you're creating the table manually from schema.sql instead,
run migrations with --fake after creating the table by hand, so
Django's migration history matches without re-running the DDL:
    python manage.py migrate accounting --fake
"""
from django.db import models


class LedgerGroup(models.Model):
    ACCOUNT_TYPE_CHOICES = [
        ("ASSET", "Asset"),
        ("LIABILITY", "Liability"),
        ("INCOME", "Income"),
        ("EXPENSE", "Expense"),
        ("EQUITY", "Equity"),
    ]

    id = models.AutoField(primary_key=True)

    # Multi-company support (India entity, UAE entity, etc.) — every group
    # belongs to exactly one company, same pattern as the rest of the app.
    company_id = models.IntegerField()

    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, null=True, blank=True)

    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPE_CHOICES)

    # Self-referencing FK builds the tree: Assets -> Current Assets -> Sundry Debtors.
    # null=True means top-level groups (Assets, Liabilities, Income, Expenses, Equity)
    # have no parent.
    parent = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,   # block deleting a group that still has children
        null=True,
        blank=True,
        related_name="children",
        db_column="parent_id",
    )

    # True for group/header nodes (Assets, Current Assets). Kept even though this
    # table is groups-only, in case a later migration merges groups + ledgers into
    # one Chart-of-Accounts table — matches the pattern already used elsewhere.
    is_group = models.BooleanField(default=True)

    # Seeded/system groups (Assets, Liabilities, etc.) that shouldn't be
    # deleted or renamed by users, matches the app's existing "is_system" idea.
    is_system = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "Ledger_Groups"
        # A group name should be unique within its own company + parent,
        # so you can't accidentally create two "Sundry Debtors" under Assets.
        constraints = [
            models.UniqueConstraint(
                fields=["company_id", "parent", "name"],
                name="uq_ledger_group_company_parent_name",
            )
        ]
        indexes = [
            models.Index(fields=["company_id"]),
            models.Index(fields=["parent"]),
        ]
        ordering = ["company_id", "parent_id", "name"]

    def __str__(self):
        return self.name

    def is_descendant_of(self, other_id):
        """Cycle guard — prevents a group being reparented under its own
        descendant. Call this before saving a parent change."""
        node = self.parent
        while node is not None:
            if node.id == other_id:
                return True
            node = node.parent
        return False


class Ledger(models.Model):
    """
    The actual leaf accounts created via the "New Ledger" form — e.g. an
    individual customer under Sundry Debtors, a bank account under Bank
    Accounts, a supplier under Sundry Creditors. Always sits under a
    LedgerGroup via `group`.

    One wide table with every category-specific field nullable, matching
    the flat payload shape the frontend's page-ledger-entry.js already
    builds (bank fields, debtor/India fields, debtor/UAE fields, creditor
    fields, duties & taxes fields, income/expense tax-settings fields).
    Only the fields relevant to whichever group category was picked get
    filled in; the rest stay NULL.
    """
    ACCOUNT_TYPE_CHOICES = LedgerGroup.ACCOUNT_TYPE_CHOICES
    BALANCE_TYPE_CHOICES = [("Debit", "Debit"), ("Credit", "Credit")]

    id = models.AutoField(primary_key=True)
    company_id = models.IntegerField()

    name = models.CharField(max_length=150)
    group = models.ForeignKey(
        LedgerGroup, on_delete=models.PROTECT, related_name="ledgers", db_column="group_id"
    )
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPE_CHOICES)
    ledger_category = models.CharField(max_length=20)  # BANK / DEBTOR / CREDITOR / INCOME / EXPENSE / DUTIES_TAXES / OTHER

    opening_balance = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    opening_balance_type = models.CharField(max_length=10, choices=BALANCE_TYPE_CHOICES, default="Debit")

    # Bank
    bank_account_no = models.CharField(max_length=40, null=True, blank=True)
    bank_branch = models.CharField(max_length=100, null=True, blank=True)
    ifsc_code = models.CharField(max_length=15, null=True, blank=True)
    swift_code = models.CharField(max_length=15, null=True, blank=True)

    # Debtor — shared
    alias_name = models.CharField(max_length=100, null=True, blank=True)
    address_line1 = models.CharField(max_length=150, null=True, blank=True)
    address_line2 = models.CharField(max_length=150, null=True, blank=True)
    agent_id = models.CharField(max_length=30, null=True, blank=True)
    maintain_balance_bill_wise = models.CharField(max_length=5, null=True, blank=True)  # "Yes" / "No"
    place_of_supply = models.CharField(max_length=60, null=True, blank=True)

    # Debtor — India
    city = models.CharField(max_length=60, null=True, blank=True)
    pincode = models.CharField(max_length=10, null=True, blank=True)
    state_name = models.CharField(max_length=60, null=True, blank=True)
    gst_no = models.CharField(max_length=20, null=True, blank=True)
    gst_registration_type = models.CharField(max_length=20, null=True, blank=True)
    pan_no = models.CharField(max_length=15, null=True, blank=True)

    # Debtor — UAE
    emirate = models.CharField(max_length=30, null=True, blank=True)
    po_box_no = models.CharField(max_length=20, null=True, blank=True)
    vat_trn_no = models.CharField(max_length=20, null=True, blank=True)
    trade_license_no = models.CharField(max_length=30, null=True, blank=True)
    trade_license_expiry = models.DateField(null=True, blank=True)

    # Creditor
    creditor_type = models.CharField(max_length=30, null=True, blank=True)
    airline_code = models.CharField(max_length=3, null=True, blank=True)
    supplier_code = models.CharField(max_length=30, null=True, blank=True)
    office_id = models.CharField(max_length=30, null=True, blank=True)

    # Duties & Taxes
    tax_category = models.CharField(max_length=10, null=True, blank=True)  # GST / TDS / Others
    tax_type = models.CharField(max_length=10, null=True, blank=True)      # IGST / CGST / SGST

    # Income / Expense tax settings
    gst_applicable = models.BooleanField(default=False)
    gst_tax_type = models.CharField(max_length=10, null=True, blank=True)
    gst_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    tds_applicable = models.BooleanField(default=False)
    tds_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    hsn_code = models.CharField(max_length=15, null=True, blank=True)
    tcs_applicable = models.BooleanField(default=False)
    tcs_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    is_system = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "Ledgers"
        constraints = [
            models.UniqueConstraint(fields=["company_id", "name"], name="uq_ledger_company_name"),
            models.UniqueConstraint(
                fields=["agent_id"], name="uq_ledger_agent_id",
                condition=models.Q(agent_id__isnull=False),
            ),
        ]
        indexes = [
            models.Index(fields=["company_id"]),
            models.Index(fields=["group"]),
        ]

    def __str__(self):
        return self.name

    @property
    def signed_balance(self):
        """Positive for Debit, negative for Credit — matches the sign
        convention the frontend already uses to redisplay balance type."""
        return self.opening_balance if self.opening_balance_type == "Debit" else -self.opening_balance


class Ticket(models.Model):
    """The invoice/booking header — Part 1 + Part 2 of the New Ticket form."""

    INVOICE_TYPE_CHOICES = [("Tax Invoice", "Tax Invoice"), ("Others", "Others")]
    BOOKING_MODE_CHOICES = [("Manual", "Manual"), ("Auto Push", "Auto Push")]
    BOOKING_STATUS_CHOICES = [("Confirmed", "Confirmed"), ("Re-Scheduled", "Re-Scheduled")]
    TRAVEL_TYPE_CHOICES = [("Domestic", "Domestic"), ("International", "International")]
    PAYMENT_MODE_CHOICES = [("Top-up", "Top-up"), ("Payment Gateway", "Payment Gateway")]
    AIRLINE_CATEGORY_CHOICES = [("LCC", "LCC"), ("FSC", "FSC"), ("OSC", "OSC")]

    id = models.AutoField(primary_key=True)
    company_id = models.IntegerField()
    branch_name = models.CharField(max_length=100, null=True, blank=True)

    invoice_number = models.CharField(max_length=20)
    invoice_date = models.DateField()
    invoice_type = models.CharField(max_length=20, choices=INVOICE_TYPE_CHOICES, null=True, blank=True)
    booking_mode = models.CharField(max_length=20, choices=BOOKING_MODE_CHOICES, default="Manual")
    booking_type = models.CharField(max_length=30, null=True, blank=True)
    booking_status = models.CharField(max_length=20, choices=BOOKING_STATUS_CHOICES, null=True, blank=True)

    customer = models.ForeignKey(
        Ledger, on_delete=models.PROTECT, related_name="tickets_as_customer", db_column="customer_ledger_id"
    )
    supplier = models.ForeignKey(
        Ledger, on_delete=models.PROTECT, related_name="tickets_as_supplier",
        null=True, blank=True, db_column="supplier_ledger_id"
    )

    travel_type = models.CharField(max_length=20, choices=TRAVEL_TYPE_CHOICES, null=True, blank=True)
    user_name = models.CharField(max_length=100, null=True, blank=True)
    currency = models.CharField(max_length=5, default="INR")
    roe = models.DecimalField(max_digits=10, decimal_places=4, default=1)
    booking_given_by = models.CharField(max_length=25, null=True, blank=True)

    booking_reference = models.CharField(max_length=30)
    booking_ref_date = models.DateField(null=True, blank=True)
    airline_pnr = models.CharField(max_length=13, null=True, blank=True)
    gds_pnr = models.CharField(max_length=13, null=True, blank=True)
    office_id = models.CharField(max_length=30, null=True, blank=True)

    payment_mode = models.CharField(max_length=20, choices=PAYMENT_MODE_CHOICES, null=True, blank=True)
    airline_category = models.CharField(max_length=5, choices=AIRLINE_CATEGORY_CHOICES, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "Tickets"
        constraints = [
            models.UniqueConstraint(fields=["company_id", "invoice_number"], name="uq_ticket_company_invoice_no"),
            models.UniqueConstraint(fields=["company_id", "booking_reference"], name="uq_ticket_company_booking_ref"),
        ]
        indexes = [models.Index(fields=["company_id"])]

    def __str__(self):
        return self.invoice_number


class TicketLine(models.Model):
    """One passenger/ticket within a Ticket's booking — Part 3, repeatable grid."""

    PAX_TYPE_CHOICES = [("Adult", "Adult"), ("Child", "Child"), ("Infant", "Infant")]
    DISC_TYPE_CHOICES = [("Percentage", "Percentage"), ("Flat", "Flat")]
    STATUS_CHOICES = [
        ("ISSUED", "Issued"), ("REFUNDED", "Refunded"), ("VOID", "Void"), ("EXCHANGED", "Exchanged"),
    ]

    id = models.AutoField(primary_key=True)
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="lines", db_column="ticket_id")

    airline_code = models.CharField(max_length=3, null=True, blank=True)
    airline_name = models.CharField(max_length=60, null=True, blank=True)
    flight_no = models.CharField(max_length=15, null=True, blank=True)
    ticket_no = models.CharField(max_length=30)
    passenger_name = models.CharField(max_length=30)
    pax_type = models.CharField(max_length=10, choices=PAX_TYPE_CHOICES, default="Adult")
    sector = models.CharField(max_length=40, null=True, blank=True)
    travel_date = models.DateField(null=True, blank=True)

    # Fare breakup
    basic_fare = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    yq = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    yr = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    k3_tax = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_others = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    seat = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    meal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    baggage = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    other_ssr = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Customer discount
    disc_on = models.CharField(max_length=20, null=True, blank=True)
    disc_type = models.CharField(max_length=12, choices=DISC_TYPE_CHOICES, null=True, blank=True)
    disc_value = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tds_per = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    # Markup / service fee / GST
    markup = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    addl_markup = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    service_fee = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    addl_service_fee = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    gst_pct = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    # Computed at save time server-side (never trust the client's total)
    total_billed = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="ISSUED")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "TicketLines"
        constraints = [
            models.UniqueConstraint(fields=["ticket_no"], name="uq_ticketline_ticket_no"),
        ]
        indexes = [models.Index(fields=["ticket"])]

    def __str__(self):
        return self.ticket_no

    def compute_total(self):
        """Same formula as the frontend's recalcLine() — recomputed here so
        the server never trusts whatever total the browser sent."""
        base_map = {
            "Basic": self.basic_fare,
            "Basic + YQ": self.basic_fare + self.yq,
            "Basic + YR": self.basic_fare + self.yr,
            "Basic + YQ + YR": self.basic_fare + self.yq + self.yr,
            "Gross": (self.basic_fare + self.yq + self.yr + self.k3_tax + self.tax_others
                      + self.seat + self.meal + self.baggage + self.other_ssr),
        }
        disc_base = base_map.get(self.disc_on, 0)
        cust_discount = (disc_base * (self.disc_value / 100)) if self.disc_type == "Percentage" else (
            self.disc_value if self.disc_type == "Flat" else 0)
        tds_amount = cust_discount * (self.tds_per / 100)
        gst_amount = (self.service_fee + self.addl_service_fee) * (self.gst_pct / 100)

        total = (self.basic_fare + self.yq + self.yr + self.k3_tax + self.tax_others
                 + self.seat + self.meal + self.baggage + self.other_ssr
                 - cust_discount + tds_amount + self.markup + self.addl_markup
                 + self.service_fee + self.addl_service_fee + gst_amount)
        return total