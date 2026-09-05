"""
Voyager ERP — Ledger Groups API
-----------------------------------------------------------------
This replaces the hardcoded COA_DEFS array that used to live in the
frontend's mock-data.js. The frontend now calls GET /api/ledger-groups/
and gets these rows straight from SQL Server instead.
"""
import json
from datetime import datetime
from django.http import JsonResponse, HttpResponseNotAllowed
from django.views.decorators.csrf import csrf_exempt
from django.forms.models import model_to_dict
from django.db import transaction
from django.db.models import ProtectedError

from .models import LedgerGroup, Ledger, Ticket, TicketLine


def ledger_groups_list(request):
    """
    GET /api/ledger-groups/?company_id=1
    Returns a FLAT list (id, name, code, account_type, parent_id, is_group,
    is_system) — same shape the frontend's renderGroupOptions() already
    expects, so swapping the data source doesn't require rewriting the
    tree-building logic in page-ledger-entry.js.
    """
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])

    company_id = request.GET.get("company_id")
    if not company_id:
        return JsonResponse({"error": "company_id is required"}, status=400)

    groups = LedgerGroup.objects.filter(company_id=company_id).order_by("id")
    data = [
        {
            "id": g.id,
            "name": g.name,
            "code": g.code,
            "account_type": g.account_type,
            "parent_id": g.parent_id,
            "is_group": g.is_group,
            "is_system": g.is_system,
        }
        for g in groups
    ]
    return JsonResponse(data, safe=False)


@csrf_exempt
def ledger_group_create(request):
    """
    POST /api/ledger-groups/create/
    Body: { "company_id": 1, "name": "...", "code": "...", "account_type": "ASSET", "parent_id": 5 }
    Kept separate from the list endpoint on purpose — the ledger-entry
    form only needs to READ groups today; this is here so adding new
    groups from the UI later is a one-line frontend change, not a new
    backend endpoint.
    """
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    required = ["company_id", "name", "account_type"]
    missing = [f for f in required if not body.get(f)]
    if missing:
        return JsonResponse({"error": f"Missing required field(s): {', '.join(missing)}"}, status=400)

    group = LedgerGroup.objects.create(
        company_id=body["company_id"],
        name=body["name"],
        code=body.get("code"),
        account_type=body["account_type"],
        parent_id=body.get("parent_id"),
        is_group=body.get("is_group", True),
    )
    return JsonResponse(model_to_dict(group), status=201)


LEDGER_FIELDS = [
    "bank_account_no", "bank_branch", "ifsc_code", "swift_code",
    "alias_name", "address_line1", "address_line2", "agent_id",
    "maintain_balance_bill_wise", "place_of_supply",
    "city", "pincode", "state_name", "gst_no", "gst_registration_type", "pan_no",
    "emirate", "po_box_no", "vat_trn_no", "trade_license_no", "trade_license_expiry",
    "creditor_type", "airline_code", "supplier_code", "office_id",
    "tax_category", "tax_type",
    "gst_applicable", "gst_tax_type", "gst_percentage",
    "tds_applicable", "tds_percentage", "hsn_code",
    "tcs_applicable", "tcs_percentage",
]


@csrf_exempt
def ledger_create(request):
    """
    POST /api/ledgers/create/
    Body: the same flat payload page-ledger-entry.js already builds —
    name, parent_id (-> group), opening_balance, opening_balance_type,
    ledger_category, plus whichever category-specific fields apply.
    Saves a real row into the Ledgers table.
    """
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    required = ["company_id", "name", "parent_id"]
    missing = [f for f in required if not body.get(f)]
    if missing:
        return JsonResponse({"error": f"Missing required field(s): {', '.join(missing)}"}, status=400)

    try:
        group = LedgerGroup.objects.get(id=body["parent_id"], company_id=body["company_id"])
    except LedgerGroup.DoesNotExist:
        return JsonResponse({"error": "That group doesn't exist for this company."}, status=400)

    if Ledger.objects.filter(company_id=body["company_id"], name=body["name"]).exists():
        return JsonResponse({"error": f"A ledger named \"{body['name']}\" already exists."}, status=409)

    extra = {f: body[f] for f in LEDGER_FIELDS if f in body}
    if extra.get("agent_id") == "":
        extra["agent_id"] = None
    if extra.get("agent_id") and Ledger.objects.filter(agent_id=extra["agent_id"]).exists():
        return JsonResponse({"error": f"Agent ID \"{extra['agent_id']}\" is already used by another ledger."}, status=409)

    ledger = Ledger.objects.create(
        company_id=body["company_id"],
        name=body["name"],
        group=group,
        account_type=group.account_type,
        ledger_category=body.get("ledger_category", "OTHER"),
        opening_balance=body.get("opening_balance", 0) or 0,
        opening_balance_type=body.get("opening_balance_type", "Debit"),
        **extra,
    )
    return JsonResponse(
        {"id": ledger.id, "name": ledger.name, "group_id": ledger.group_id, "message": "Ledger created."},
        status=201,
    )


@csrf_exempt
def ledger_delete(request, ledger_id):
    """
    DELETE /api/ledgers/<id>/delete/?company_id=1
    Removes a real row from the Ledgers table. This is what the
    "Delete" button on the Chart of Accounts page now actually calls —
    previously it was checking mock data, which is why deleting a
    real DB-created ledger (like "MANO") failed with "Ledger not found".
    """
    if request.method != "DELETE":
        return HttpResponseNotAllowed(["DELETE"])

    company_id = request.GET.get("company_id")
    if not company_id:
        return JsonResponse({"error": "company_id is required"}, status=400)

    try:
        ledger = Ledger.objects.get(id=ledger_id, company_id=company_id)
    except Ledger.DoesNotExist:
        return JsonResponse({"error": "Ledger not found."}, status=404)

    try:
        ledger.delete()
    except ProtectedError:
        return JsonResponse(
            {"error": f"\"{ledger.name}\" is used by one or more tickets and can't be deleted."}, status=409
        )
    return JsonResponse({"message": "Ledger deleted."}, status=200)


def customers_list(request):
    """
    GET /api/customers/?company_id=1
    Real customers = Ledgers created under a Sundry Debtors-type group
    (ledger_category='DEBTOR'). This replaces the hardcoded "Sundaram
    Exports 1-10" customer list the New Ticket form used to load from
    mock-data.js — any ledger created via the New Ledger form under
    Sundry Debtors (like "GOKUL S") now shows up here automatically.
    """
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])

    company_id = request.GET.get("company_id")
    if not company_id:
        return JsonResponse({"error": "company_id is required"}, status=400)

    customers = Ledger.objects.filter(company_id=company_id, ledger_category="DEBTOR")
    data = []
    for c in customers:
        india_parts = [p for p in [c.address_line1, c.address_line2, c.city, c.state_name, c.pincode] if p]
        uae_parts = [p for p in [c.address_line1, c.address_line2, c.emirate, c.po_box_no] if p]
        address = ", ".join(india_parts) or ", ".join(uae_parts) or None
        data.append({
            "id": c.id,
            "name": c.name,
            "code": f"LED-{c.id:05d}",
            "gst_no": c.gst_no or c.vat_trn_no,
            "address": address,
        })
    return JsonResponse(data, safe=False)


def ledger_detail(request, ledger_id):
    """
    GET /api/ledgers/<id>/?company_id=1
    Returns one ledger's full field set — used by ledger-entry.html to
    prefill the edit form. Field names match the payload the form
    already builds, so prefillForm() needs no field-name translation.
    """
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])

    company_id = request.GET.get("company_id")
    if not company_id:
        return JsonResponse({"error": "company_id is required"}, status=400)

    try:
        l = Ledger.objects.get(id=ledger_id, company_id=company_id)
    except Ledger.DoesNotExist:
        return JsonResponse({"error": "Ledger not found."}, status=404)

    data = {"id": l.id, "name": l.name, "parent_id": l.group_id, "opening_balance": float(l.opening_balance),
             "balance": float(l.signed_balance), "opening_balance_type": l.opening_balance_type,
             "ledger_category": l.ledger_category}
    for f in LEDGER_FIELDS:
        v = getattr(l, f)
        data[f] = v.isoformat() if hasattr(v, "isoformat") else v
    return JsonResponse(data)


@csrf_exempt
def ledger_update(request, ledger_id):
    """
    PUT /api/ledgers/<id>/update/?company_id=1
    Same body shape as ledger_create. Updates a real row in place.
    """
    if request.method != "PUT":
        return HttpResponseNotAllowed(["PUT"])

    company_id = request.GET.get("company_id")
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    try:
        ledger = Ledger.objects.get(id=ledger_id, company_id=company_id)
    except Ledger.DoesNotExist:
        return JsonResponse({"error": "Ledger not found."}, status=404)

    if "name" in body and Ledger.objects.filter(company_id=company_id, name=body["name"]).exclude(id=ledger_id).exists():
        return JsonResponse({"error": f"A ledger named \"{body['name']}\" already exists."}, status=409)

    if "agent_id" in body and body["agent_id"] == "":
        body["agent_id"] = None
    if body.get("agent_id") and Ledger.objects.filter(agent_id=body["agent_id"]).exclude(id=ledger_id).exists():
        return JsonResponse({"error": f"Agent ID \"{body['agent_id']}\" is already used by another ledger."}, status=409)

    if "name" in body:
        ledger.name = body["name"]
    if "parent_id" in body:
        try:
            ledger.group = LedgerGroup.objects.get(id=body["parent_id"], company_id=company_id)
            ledger.account_type = ledger.group.account_type
        except LedgerGroup.DoesNotExist:
            return JsonResponse({"error": "That group doesn't exist for this company."}, status=400)
    if "opening_balance" in body:
        ledger.opening_balance = body["opening_balance"] or 0
    if "opening_balance_type" in body:
        ledger.opening_balance_type = body["opening_balance_type"]
    if "ledger_category" in body:
        ledger.ledger_category = body["ledger_category"]
    for f in LEDGER_FIELDS:
        if f in body:
            setattr(ledger, f, body[f])
    ledger.save()
    return JsonResponse({"id": ledger.id, "message": "Ledger updated."})


def ledger_agent_id_available(request):
    """
    GET /api/ledgers/agent-id-available/?agent_id=AGT-001&exclude_id=5
    Agent ID is unique GLOBALLY (across every company/ledger), not just
    within one company — matches "no duplicate allowed" as stated.
    """
    agent_id = (request.GET.get("agent_id") or "").strip()
    exclude_id = request.GET.get("exclude_id")
    if not agent_id:
        return JsonResponse({"available": True})
    qs = Ledger.objects.filter(agent_id__iexact=agent_id)
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    return JsonResponse({"available": not qs.exists()})


def ledger_name_available(request):
    """
    GET /api/ledgers/name-available/?company_id=1&name=Gokul+Kumar&exclude_id=5
    Live uniqueness check the New Ledger form calls on blur, so a
    duplicate name is caught before Save instead of only after.
    """
    company_id = request.GET.get("company_id")
    name = (request.GET.get("name") or "").strip()
    exclude_id = request.GET.get("exclude_id")
    if not company_id or not name:
        return JsonResponse({"available": True})
    qs = Ledger.objects.filter(company_id=company_id, name__iexact=name)
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    return JsonResponse({"available": not qs.exists()})


def suppliers_list(request):
    """
    GET /api/suppliers/?company_id=1
    Real suppliers = Ledgers under a Sundry Creditors-type group
    (ledger_category='CREDITOR'). Same pattern as customers_list.
    Includes office_id and supplier_code so the New Ticket form can
    auto-fill those from the selected supplier's ledger record.
    """
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])

    company_id = request.GET.get("company_id")
    if not company_id:
        return JsonResponse({"error": "company_id is required"}, status=400)

    suppliers = Ledger.objects.filter(company_id=company_id, ledger_category="CREDITOR")
    data = [
        {"id": s.id, "name": s.name, "code": s.supplier_code or f"LED-{s.id:05d}", "office_id": s.office_id}
        for s in suppliers
    ]
    return JsonResponse(data, safe=False)


def accounts_list(request):
    """
    GET /api/accounts/?company_id=1
    Groups + ledgers merged into ONE flat list, in the exact shape
    page-accounts.js already expects (id, code, name, account_type,
    is_group, parent_id, balance) — so the Chart of Accounts tree
    renders new DB ledgers under their real group with zero frontend
    rendering changes.
    """
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])

    company_id = request.GET.get("company_id")
    if not company_id:
        return JsonResponse({"error": "company_id is required"}, status=400)

    rows = []
    for g in LedgerGroup.objects.filter(company_id=company_id):
        rows.append({
            "id": f"g{g.id}", "code": g.code or "", "name": g.name,
            "account_type": g.account_type, "is_group": True,
            "parent_id": f"g{g.parent_id}" if g.parent_id else None,
            "balance": None,
        })
    for l in Ledger.objects.filter(company_id=company_id).select_related("group"):
        in_use = Ticket.objects.filter(customer_id=l.id).exists() or Ticket.objects.filter(supplier_id=l.id).exists()
        rows.append({
            "id": l.id, "code": l.group.code or "", "name": l.name,
            "account_type": l.account_type, "is_group": False,
            "parent_id": f"g{l.group_id}",
            "balance": float(l.signed_balance),
            "is_in_use": in_use,
        })
    return JsonResponse(rows, safe=False)


TICKET_HEADER_FIELDS = [
    "invoice_number", "invoice_date", "invoice_type", "booking_mode", "booking_type", "booking_status",
    "travel_type", "user_name", "currency", "roe", "booking_given_by",
    "booking_reference", "booking_ref_date", "airline_pnr", "gds_pnr", "office_id",
    "payment_mode", "airline_category", "branch_name",
]
TICKET_LINE_FIELDS = [
    "airline_code", "airline_name", "flight_no", "ticket_no", "passenger_name", "pax_type",
    "sector", "travel_date", "basic_fare", "yq", "yr", "k3_tax", "tax_others", "seat", "meal",
    "baggage", "other_ssr", "disc_on", "disc_type", "disc_value", "tds_per",
    "markup", "addl_markup", "service_fee", "addl_service_fee", "gst_pct", "status",
]


def _parse_date(val):
    if not val:
        return None
    return datetime.strptime(val, "%Y-%m-%d").date() if isinstance(val, str) else val


@csrf_exempt
@transaction.atomic
def ticket_create(request):
    """
    POST /api/tickets/create/
    Body: { company_id, ...header fields, customer_name, supplier_name,
            lines: [ {...line fields}, ... ] }

    Real server-side checks the client-side form already does, done
    again here since a browser's JS validation can always be bypassed:
    - customer_name / supplier_name must match a real Ledger
      (ledger_category DEBTOR / CREDITOR) for this company
    - invoice_number and booking_reference must be unique per company
    - ticket_no must be unique across ALL tickets, and not repeated
      within the same submitted lines array
    - total_billed is recomputed server-side per line — the browser's
      number is never trusted directly
    """
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    company_id = body.get("company_id")
    lines_in = body.get("lines") or []
    if not company_id or not body.get("customer_name") or not body.get("invoice_number") or not lines_in:
        return JsonResponse({"error": "company_id, customer_name, invoice_number and at least one line are required."}, status=400)

    try:
        customer = Ledger.objects.get(company_id=company_id, name=body["customer_name"], ledger_category="DEBTOR")
    except Ledger.DoesNotExist:
        return JsonResponse({"error": f"\"{body['customer_name']}\" is not a real customer ledger (Sundry Debtors)."}, status=400)

    supplier = None
    if body.get("supplier_name"):
        try:
            supplier = Ledger.objects.get(company_id=company_id, name=body["supplier_name"], ledger_category="CREDITOR")
        except Ledger.DoesNotExist:
            return JsonResponse({"error": f"\"{body['supplier_name']}\" is not a real supplier ledger (Sundry Creditors)."}, status=400)

    if Ticket.objects.filter(company_id=company_id, invoice_number=body["invoice_number"]).exists():
        return JsonResponse({"error": f"Invoice Number \"{body['invoice_number']}\" already exists."}, status=409)
    if body.get("booking_reference") and Ticket.objects.filter(company_id=company_id, booking_reference=body["booking_reference"]).exists():
        return JsonResponse({"error": f"Booking Reference \"{body['booking_reference']}\" already exists."}, status=409)

    ticket_nos = [l.get("ticket_no") for l in lines_in]
    if len(ticket_nos) != len(set(ticket_nos)):
        return JsonResponse({"error": "Duplicate Ticket Number within this submission."}, status=409)
    existing = TicketLine.objects.filter(ticket_no__in=ticket_nos)
    if existing.exists():
        return JsonResponse({"error": f"Ticket Number \"{existing.first().ticket_no}\" already exists."}, status=409)

    header_kwargs = {f: body[f] for f in TICKET_HEADER_FIELDS if f in body}
    header_kwargs["invoice_date"] = _parse_date(header_kwargs.get("invoice_date"))
    header_kwargs["booking_ref_date"] = _parse_date(header_kwargs.get("booking_ref_date"))

    ticket = Ticket.objects.create(company_id=company_id, customer=customer, supplier=supplier, **header_kwargs)

    created_lines = []
    for line_in in lines_in:
        line_kwargs = {f: line_in[f] for f in TICKET_LINE_FIELDS if f in line_in}
        line_kwargs["travel_date"] = _parse_date(line_kwargs.get("travel_date"))
        line = TicketLine(ticket=ticket, **line_kwargs)
        line.total_billed = line.compute_total()
        line.save()
        created_lines.append(line.id)

    return JsonResponse({"id": ticket.id, "line_ids": created_lines, "message": "Ticket saved."}, status=201)


def tickets_list(request):
    """
    GET /api/tickets/?company_id=1
    One row per TicketLine, joined with its Ticket header — matches
    exactly what tickets.html's table + details modal already expect
    (pnr, ticket_no, airline_name, passenger_name, sector, issue_date,
    basic_fare, markup, total_billed, status, plus every header/line
    detail field for the "View Details" modal).
    """
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])

    company_id = request.GET.get("company_id")
    if not company_id:
        return JsonResponse({"error": "company_id is required"}, status=400)

    rows = []
    lines = TicketLine.objects.filter(ticket__company_id=company_id).select_related("ticket", "ticket__customer", "ticket__supplier").order_by("-id")
    for l in lines:
        t = l.ticket
        rows.append({
            "id": l.id,
            "pnr": t.airline_pnr or t.gds_pnr or t.booking_reference,
            "ticket_no": l.ticket_no, "airline_name": l.airline_name, "airline_code": l.airline_code,
            "flight_no": l.flight_no, "passenger_name": l.passenger_name, "pax_type": l.pax_type,
            "sector": l.sector, "issue_date": t.invoice_date.isoformat() if t.invoice_date else None,
            "travel_date": l.travel_date.isoformat() if l.travel_date else None,
            "basic_fare": float(l.basic_fare), "markup": float(l.markup), "total_billed": float(l.total_billed),
            "status": l.status,
            "invoice_number": t.invoice_number, "invoice_date": t.invoice_date.isoformat() if t.invoice_date else None,
            "invoice_type": t.invoice_type, "booking_mode": t.booking_mode, "booking_type": t.booking_type,
            "booking_status": t.booking_status, "customer_name": t.customer.name,
            "travel_type": t.travel_type, "user_name": t.user_name, "currency": t.currency, "roe": float(t.roe),
            "booking_given_by": t.booking_given_by, "payment_mode": t.payment_mode, "airline_category": t.airline_category,
            "booking_reference": t.booking_reference, "booking_ref_date": t.booking_ref_date.isoformat() if t.booking_ref_date else None,
            "airline_pnr": t.airline_pnr, "gds_pnr": t.gds_pnr, "supplier_name": t.supplier.name if t.supplier else None,
            "office_id": t.office_id,
            "yq": float(l.yq), "yr": float(l.yr), "k3_tax": float(l.k3_tax), "tax_others": float(l.tax_others),
            "seat": float(l.seat), "meal": float(l.meal), "baggage": float(l.baggage), "other_ssr": float(l.other_ssr),
            "disc_on": l.disc_on, "disc_type": l.disc_type, "disc_value": float(l.disc_value), "tds_per": float(l.tds_per),
            "addl_markup": float(l.addl_markup), "service_fee": float(l.service_fee),
            "addl_service_fee": float(l.addl_service_fee), "gst_pct": float(l.gst_pct),
        })
    return JsonResponse(rows, safe=False)