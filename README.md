# Skplore — Admin Dashboard

> **Standalone admin panel** for managing the Skplore e-commerce store. Built with Next.js 16, React 19, Supabase, and Cloudflare R2. Runs independently on port 3001, fully decoupled from the customer-facing storefront.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Authentication Flow](#authentication-flow)
- [Data Management Workflow](#data-management-workflow)
- [Routing & Pages](#routing--pages)
- [Dashboard Page](#dashboard-page)
- [Categories Management](#categories-management)
- [Products Management](#products-management)
- [Dynamic Gadget Order Limits](#dynamic-gadget-order-limits)
- [Category Discounts Management](#category-discounts-management)
- [Image Upload & Cloudflare R2 Direct Pipeline](#image-upload--cloudflare-r2-direct-pipeline)
- [Database Schema](#database-schema)
- [Middleware / Edge Proxy (Route Protection)](#middleware--edge-proxy-route-protection)
- [Supabase Clients](#supabase-clients)
- [Styling](#styling)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Relationship with Storefront](#relationship-with-storefront)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                      SKPLORE ECOSYSTEM                       │
├─────────────────────────────┬────────────────────────────────┤
│  STOREFRONT (separate app)  │  ADMIN PANEL (this project)    │
│  Port: 3000                 │  Port: 3001                    │
│  d:\skplore\                │  d:\skplore-admin\            │
│  Repository: skplore        │  Repository: skplore-admin     │
│  Public customer website    │  Private password-protected    │
├─────────────────────────────┴────────────────────────────────┤
│                    SHARED INFRASTRUCTURE                     │
│  Database: Supabase (PostgreSQL)                             │
│  Image Storage: Cloudflare R2 (Direct browser upload)        │
│  Config Storage: Supabase Storage (store-config bucket)      │
│  Auth: Supabase Auth (admin users only)                      │
└──────────────────────────────────────────────────────────────┘
```

The admin panel and storefront are **two completely independent Next.js applications** that share the same Supabase database, Cloudflare R2 bucket, and storage bucket.

---

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.2.1 (Turbopack) | Framework (App Router, API routes, edge proxy) |
| **React** | 19.2.4 | UI library |
| **@supabase/ssr** | 0.10.0 | Server-side + client-side Supabase authentication |
| **@supabase/supabase-js** | 2.101.1 | Database queries, storage operations, and auth |
| **@aws-sdk/client-s3** | ^3.1070.0 | Cloudflare R2 pre-signed URL generation |
| **Vanilla CSS** | — | `admin.css` design system |

---

## Project Structure

```
skplore-admin/
├── src/
│   ├── app/
│   │   ├── admin.css                   # Admin design tokens & styles
│   │   ├── AdminLayoutClient.js        # Sidebar + topbar layout
│   │   ├── layout.js                   # Root layout
│   │   ├── page.js                     # Dashboard overview
│   │   │
│   │   ├── categories/page.js          # Category & subcategory CRUD
│   │   ├── discounts/page.js           # Dynamic category discount rates
│   │   ├── products/
│   │   │   ├── page.js                 # Products table (Order limits, toggle, delete)
│   │   │   ├── new/page.js             # Add new product form
│   │   │   └── [id]/edit/page.js       # Edit product form with real-time limits
│   │   ├── login/page.js               # Password authentication
│   │   │
│   │   └── api/
│   │       ├── categories/route.js     # Categories API
│   │       ├── subcategories/route.js  # Subcategories API
│   │       ├── products/route.js       # Enriched products list API
│   │       ├── upload-product/route.js # Product creation
│   │       ├── edit-product/route.js   # Product update + limit persistence
│   │       ├── delete-product/route.js # Product + image cascade delete
│   │       ├── toggle-product/route.js # Show/hide toggle
│   │       ├── gadget-limits/route.js  # Dedicated real-time gadget limits API
│   │       ├── discounts/route.js      # Dynamic discounts API
│   │       ├── r2-presigned-url/route.js # Cloudflare R2 pre-signed upload URLs
│   │       └── save-image/route.js     # Attach uploaded image row to product
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── admin.js                # Service-role client
│   │   │   ├── client.js               # Browser client
│   │   │   ├── server.js               # Server component client
│   │   │   └── middleware.js           # Edge helper
│   │   ├── r2.js                       # Cloudflare S3 SDK client
│   │   ├── r2Direct.js                 # Direct browser-to-R2 upload utility
│   │   ├── compressImage.js            # Client-side image compression
│   │   └── requireAuth.js              # API route session guard
│   │
│   └── proxy.js                        # Edge authentication proxy
│
├── .env.local                          # Environment secrets (ignored by Git)
├── .env.example                        # Template for required environment keys
├── next.config.mjs                     # Allowed domains & image remote patterns
└── package.json                        # Dependencies and scripts
```

---

## Dynamic Gadget Order Limits

For gadget products, the admin can configure dynamic purchasing boundaries that are enforced across the customer website:
- **Minimum Order Quantity**: Default order starting quantity; customers cannot decrease below this number (`−` button locked).
- **Upper Limit / Max Order**: Maximum units allowed per order (`+` button locked).
- **Total Available Quantity / Stock**: Inventory limit tracked in real time.

### Multi-Layer Real-Time Persistence
1. **Public Storage CDN** (`store-config/gadget_quantities.json`): Guarantees instant client-side fetching with timestamp cache-busting.
2. **Dedicated API Route** (`/api/gadget-limits`): Returns un-cached limits for individual products or the entire catalog.
3. **Database Columns** (`min_order_quantity`, `max_order_quantity`, `stock_quantity`): Dual-layer sync with PostgreSQL.

---

## Category Discounts Management

Accessible at `/discounts`:
- Set percentage discounts for entire categories (`Clothing`, `Footwear`, `Accessories`, `Gadgets`).
- Stored in `store-config/discounts.json` and dynamically applied across storefront product pricing, cart summaries, and drawer totals.

---

## Image Upload & Cloudflare R2 Direct Pipeline

Product image uploads bypass Next.js server payload limits by uploading directly from the browser to Cloudflare R2:
1. Client selects images → compressed in-browser to WebP via `compressImage.js`.
2. Client requests pre-signed PUT URL from `/api/r2-presigned-url`.
3. Client streams compressed bytes directly to Cloudflare R2.
4. Client notifies `/api/save-image` to record the public R2 URL in PostgreSQL.

---

## Environment Variables

Create a `.env.local` file in the project root:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Cloudflare R2 Configuration (Direct image storage)
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_ACCESS_KEY_ID=your-access-key-id
CLOUDFLARE_SECRET_ACCESS_KEY=your-secret-access-key
CLOUDFLARE_BUCKET_NAME=skplore-images
CLOUDFLARE_PUBLIC_DOMAIN=https://pub-xxxxxx.r2.dev

# Link back to storefront
NEXT_PUBLIC_STOREFRONT_URL=http://localhost:3000
```

---

## Getting Started

### Installation

```bash
# Navigate to the admin folder
cd d:\skplore-admin

# Install dependencies
npm install

# Start development server
npm run dev
```

The admin dashboard runs at **http://localhost:3001**.

---

## Relationship with Storefront

| Aspect | Admin Panel | Storefront |
|--------|-------------|------------|
| **Repository** | `skplore-admin` | `skplore` |
| **Directory** | `d:\skplore-admin\` | `d:\skplore\` |
| **Port** | 3001 | 3000 |
| **Access** | Password-protected (Supabase Auth) | Public |
| **Database** | Full CRUD (read + write) | Read-only |
| **Storage** | Uploads directly to Cloudflare R2 & store-config | Reads from R2 CDN & store-config |

---

## License

Private project — Skplore.
