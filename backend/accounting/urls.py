from django.urls import path
from . import views

urlpatterns = [
    path("ledger-groups/", views.ledger_groups_list, name="ledger-groups-list"),
    path("ledger-groups/create/", views.ledger_group_create, name="ledger-group-create"),
    path("ledgers/create/", views.ledger_create, name="ledger-create"),
    path("ledgers/name-available/", views.ledger_name_available, name="ledger-name-available"),
    path("ledgers/agent-id-available/", views.ledger_agent_id_available, name="ledger-agent-id-available"),
    path("ledgers/<int:ledger_id>/", views.ledger_detail, name="ledger-detail"),
    path("ledgers/<int:ledger_id>/update/", views.ledger_update, name="ledger-update"),
    path("ledgers/<int:ledger_id>/delete/", views.ledger_delete, name="ledger-delete"),
    path("customers/", views.customers_list, name="customers-list"),
    path("suppliers/", views.suppliers_list, name="suppliers-list"),
    path("accounts/", views.accounts_list, name="accounts-list"),
    path("tickets/", views.tickets_list, name="tickets-list"),
    path("tickets/create/", views.ticket_create, name="ticket-create"),
]