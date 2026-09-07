# 🚀 Voyager ERP — Deployment Status & Monday Checklist

**Date Recorded:** Saturday, September 5, 2026  
**Project:** Voyager ERP (Travel Accounting & Financial Management)

---

## 🟢 1. Database (TiDB Cloud Serverless) — COMPLETED & LIVE
- **Status:** **Active & Verified**
- **Host:** `gateway01.ap-southeast-1.prod.aws.tidbcloud.com`
- **Port:** `4000`
- **Database:** `accounting_db`
- **User:** `3qMkjnZ9kBfvXpx.root`
- **SSL:** Enabled (`DB_SSL=True`)
- **Tables:** All Django migrations applied (`0001_initial`, `0002_...`, `contenttypes`).
- **Seed Data:** 54 standard Chart of Accounts / Ledger Groups loaded.

---

## 🟢 2. Backend (Render Web Service) — COMPLETED & LIVE
- **Status:** **Live & Operational**
- **Service Name:** `voyager-erp`
- **Live URL:** `https://voyager-erp.onrender.com`
- **Verified Endpoint:** `https://voyager-erp.onrender.com/api/ledger-groups/?company_id=1` (Returns HTTP 200 with 27 groups).
- **WSGI Server:** Gunicorn 26.2.0 on Python 3.14
- **Static Assets:** WhiteNoise configured

---

## 🟢 3. GitHub Repository — COMPLETED
- **Repository:** [https://github.com/manoharan2801sts-code/voyager-erp](https://github.com/manoharan2801sts-code/voyager-erp)
- **Branch:** `main`
- **Root Directory:** Contains all HTML pages, `assets/` (CSS/JS), `backend/`, `netlify.toml`, `_redirects`.

---

## 🟡 4. Frontend (Netlify) — PENDING FOR MONDAY (2-Minute Job)

On Monday, perform these 2 simple steps:

### Step A: Update Render URL in GitHub
1. Open [https://github.com/manoharan2801sts-code/voyager-erp](https://github.com/manoharan2801sts-code/voyager-erp)
2. Open **`_redirects`** file $\rightarrow$ click **Edit (pencil icon)**:
   Ensure it reads:
   ```text
   /api/*  https://voyager-erp.onrender.com/api/:splat  200!
   /*      /index.html                                   200
   ```
3. Open **`netlify.toml`** file $\rightarrow$ click **Edit (pencil icon)**:
   Change `https://YOUR_RENDER_SERVICE.onrender.com` to:
   ```toml
   to = "https://voyager-erp.onrender.com/api/:splat"
   ```
4. Click **Commit changes**.

### Step B: Deploy on Netlify
1. Go to [https://app.netlify.com/](https://app.netlify.com/)
2. Click **"Add new site"** $\rightarrow$ **"Import an existing project"**
3. Select **GitHub** $\rightarrow$ choose **`voyager-erp`**
4. Publish directory: `.` (leave as root) $\rightarrow$ Click **"Deploy voyager-erp"**!
5. Frontend will be live on your custom Netlify URL, talking directly to Render and TiDB Cloud!
