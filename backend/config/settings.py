"""
Voyager ERP — Django settings (config file)
-----------------------------------------------------------------
Reads everything from environment variables via python-decouple.
Supports local MySQL and TiDB Serverless Cloud (MySQL compatible + SSL).
"""
from pathlib import Path
from decouple import config, Csv

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config("DJANGO_SECRET_KEY", default="django-insecure-voyager-accounting-key")
DEBUG = config("DJANGO_DEBUG", default=True, cast=bool)

ALLOWED_HOSTS = config(
    "DJANGO_ALLOWED_HOSTS",
    default="*" if DEBUG else "localhost,127.0.0.1,.onrender.com",
    cast=Csv()
)

SILENCED_SYSTEM_CHECKS = ["models.W036"]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "corsheaders",
    "accounting",  # the app containing models.py / views.py / urls.py
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"

# ---------------------------------------------------------------------------
# CORS configuration
# ---------------------------------------------------------------------------
cors_origins = config("CORS_ALLOWED_ORIGINS", default="*", cast=Csv())
if "*" in cors_origins or DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True
else:
    CORS_ALLOWED_ORIGINS = cors_origins
    CORS_ALLOW_ALL_ORIGINS = False

# ---------------------------------------------------------------------------
# Database — MySQL / TiDB via PyMySQL
# ---------------------------------------------------------------------------
db_options = {
    "charset": "utf8mb4",
    "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
}

# TiDB Serverless requires SSL / TLS encryption
if config("DB_SSL", default=False, cast=bool):
    ssl_dict = {}
    ca_path = config("DB_SSL_CA", default="")
    if not ca_path:
        try:
            import certifi
            ca_path = certifi.where()
        except ImportError:
            ca_path = None
    if ca_path:
        ssl_dict["ca"] = ca_path
    db_options["ssl"] = ssl_dict

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": config("DB_NAME", default="accounting_db"),
        "USER": config("DB_USER", default="root"),
        "PASSWORD": config("DB_PASSWORD", default="Mano@2005"),
        "HOST": config("DB_HOST", default="127.0.0.1"),
        "PORT": config("DB_PORT", default="3306"),
        "OPTIONS": db_options,
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.AutoField"

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

USE_TZ = True
TIME_ZONE = "Asia/Kolkata"