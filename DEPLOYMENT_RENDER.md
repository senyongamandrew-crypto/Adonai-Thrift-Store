# Render Deployment Guide — Adonai Thrift Store

This guide explains how to deploy the **Adonai Thrift Store** full-stack Next.js and PostgreSQL POS application on [Render](https://render.com).

---

## Method 1: Automatic Blueprint Deployment (Recommended)

Render can automatically provision both the **Web Service (Next.js)** and the **PostgreSQL Database** using the included `render.yaml` Blueprint file.

### Step-by-Step Instructions:
1. **Push your code to GitHub / GitLab:**
   Ensure your repository contains all files including `render.yaml`, `drizzle.config.ts`, and `package.json`.

2. **Open Render Dashboard:**
   - Log in to your [Render Dashboard](https://dashboard.render.com).
   - Click **New +** in the top right corner and select **Blueprint**.

3. **Connect Your Repository:**
   - Select your `adonai-thrift-store` repository.
   - Render will read `render.yaml` and automatically configure:
     - **PostgreSQL Database:** `adonai-db` (Database: `app_db`)
     - **Web Service:** `adonai-thrift-store`
     - **Build Command:** `npm install && npx drizzle-kit push && npm run build`
     - **Start Command:** `npm run start`
     - **Health Check Path:** `/api/health`
     - **Environment Variable:** `DATABASE_URL` linked to the database.

4. **Click "Apply":**
   Render will create the PostgreSQL database, push the table schemas with Drizzle, build the Next.js production bundle, and launch the service.

---

## Method 2: Manual Dashboard Deployment

If you prefer to set up services manually through the Render UI:

### Step 1: Create PostgreSQL Database on Render
1. In Render Dashboard, click **New +** → **PostgreSQL**.
2. **Name:** `adonai-db`
3. **Database Name:** `app_db`
4. **User:** `postgres`
5. **Region:** Choose the region closest to you (e.g., Oregon or Frankfurt).
6. **Plan:** Free or Starter.
7. Click **Create Database**.
8. Once created, copy the **Internal Database URL** (or External Database URL if deploying outside Render's network).

### Step 2: Create Web Service on Render
1. Click **New +** → **Web Service**.
2. Connect your GitHub/GitLab repository.
3. Configure settings:
   - **Name:** `adonai-thrift-store`
   - **Language / Runtime:** `Node`
   - **Branch:** `main` (or your active branch)
   - **Region:** Same region as your database.
   - **Build Command:**
     ```bash
     npm install && npx drizzle-kit push && npm run build
     ```
   - **Start Command:**
     ```bash
     npm run start
     ```
   - **Health Check Path:** `/api/health`

### Step 3: Add Environment Variables in Render Web Service
In the **Environment** tab of your Web Service, add:

| Key | Value | Notes |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://...` | Paste your Render PostgreSQL Internal Database URL |
| `NODE_ENV` | `production` | Production environment |

4. Click **Save Changes** and deploy!

---

## Verification & First Load

1. **Automatic Database Seeding:**
   On the first request to `/api/health` or `/`, the application automatically seeds realistic Ugandan demo inventory, categories, staff accounts, and default settings if the database is empty.

2. **Accessing the Portals:**
   - **Public E-Commerce & WhatsApp Catalog:** `https://your-app-name.onrender.com/`
   - **POS Cashier Terminal:** `https://your-app-name.onrender.com/pos`
   - **Staff Entrance / Login:** `https://your-app-name.onrender.com/login`
   - **Order Tracking:** `https://your-app-name.onrender.com/tracking`
   - **About Us & Location:** `https://your-app-name.onrender.com/about`

3. **Staff Logins:**
   - **Owner / Admin:** `admin` / `admin` (or `amara@adonaithrift.store` / `thrift-demo`)
   - **Cashier / Register:** `cashier` / `cashier` (or `priya@adonaithrift.store` / `thrift-demo`)
   - **Boda Rider / Dispatch:** `rider` / `rider` (or `kofi@adonaithrift.store` / `thrift-demo`)
   - **Admin Master Key:** `ADONAI-MASTER-2026`
