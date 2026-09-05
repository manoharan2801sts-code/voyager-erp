from django.core.management.base import BaseCommand
from accounting.models import LedgerGroup

class Command(BaseCommand):
    help = "Seed standard chart of accounts ledger groups for Company 1 & 2"

    def handle(self, *args, **options):
        companies = [1, 2]
        level1 = [
            ("Assets", "1000", "ASSET"),
            ("Liabilities", "2000", "LIABILITY"),
            ("Income", "4000", "INCOME"),
            ("Expenses", "5000", "EXPENSE"),
        ]

        level2 = [
            ("Capital Account", "2100", "LIABILITY", "2000"),
            ("Loans (Liability)", "2200", "LIABILITY", "2000"),
            ("Current Liabilities", "2300", "LIABILITY", "2000"),
            ("Fixed Assets", "1100", "ASSET", "1000"),
            ("Investments", "1200", "ASSET", "1000"),
            ("Current Assets", "1300", "ASSET", "1000"),
            ("Sales Accounts", "4100", "INCOME", "4000"),
            ("Direct Income", "4200", "INCOME", "4000"),
            ("Indirect Income", "4300", "INCOME", "4000"),
            ("Purchase Accounts", "5100", "EXPENSE", "5000"),
            ("Direct Expenses", "5200", "EXPENSE", "5000"),
            ("Indirect Expenses", "5300", "EXPENSE", "5000"),
        ]

        level3 = [
            ("Secured Loans", "2210", "LIABILITY", "2200"),
            ("Unsecured Loans", "2220", "LIABILITY", "2200"),
            ("Sundry Creditors", "2310", "LIABILITY", "2300"),
            ("Duties & Taxes", "2320", "LIABILITY", "2300"),
            ("Provisions", "2330", "LIABILITY", "2300"),
            ("Sundry Debtors", "1310", "ASSET", "1300"),
            ("Bank Accounts", "1320", "ASSET", "1300"),
            ("Cash-in-hand", "1330", "ASSET", "1300"),
            ("Deposits (Asset)", "1340", "ASSET", "1300"),
            ("Stock-in-hand", "1350", "ASSET", "1300"),
            ("Tax Assets", "1360", "ASSET", "1300"),
        ]

        total_created = 0
        for comp_id in companies:
            group_map = {}
            for name, code, acc_type in level1:
                g, created = LedgerGroup.objects.get_or_create(
                    company_id=comp_id,
                    code=code,
                    defaults={"name": name, "account_type": acc_type, "is_group": True, "is_system": True}
                )
                group_map[code] = g
                if created:
                    total_created += 1

            for name, code, acc_type, pcode in level2:
                parent = group_map.get(pcode)
                g, created = LedgerGroup.objects.get_or_create(
                    company_id=comp_id,
                    code=code,
                    defaults={
                        "name": name,
                        "account_type": acc_type,
                        "parent": parent,
                        "is_group": True,
                        "is_system": True
                    }
                )
                group_map[code] = g
                if created:
                    total_created += 1

            for name, code, acc_type, pcode in level3:
                parent = group_map.get(pcode)
                g, created = LedgerGroup.objects.get_or_create(
                    company_id=comp_id,
                    code=code,
                    defaults={
                        "name": name,
                        "account_type": acc_type,
                        "parent": parent,
                        "is_group": True,
                        "is_system": True
                    }
                )
                group_map[code] = g
                if created:
                    total_created += 1

        self.stdout.write(self.style.SUCCESS(f"Seed complete. Created {total_created} new ledger groups."))
