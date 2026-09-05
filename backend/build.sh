#!/usr/bin/env bash
# Render build script for Voyager ERP backend
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input || true
python manage.py migrate
python manage.py seed_db
