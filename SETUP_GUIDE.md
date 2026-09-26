# Skplore — New Infrastructure Setup Guide

> **Purpose**: This guide walks you through creating all the external services Skplore needs and how to connect them. Follow the steps **in order** — each step builds on the previous one.

---

## Overview of Services Needed

| # | Service | Purpose | Free Tier? |
|---|---------|---------|-----------|
| 1 | **Supabase** | PostgreSQL database + Auth + Row Level Security | Yes (free) |
| 2 | **Cloudflare R2** | Image storage (CDN-delivered product photos) | Yes (10 GB free) |
| 3 | **Cloudinary** | Image upload pipeline (compression, transforms) | Yes (free) |
| 4 | **Vercel** (optional) | Hosting both Next.js apps | Yes (Hobby plan free) |

---

## STEP 1 — Create Supabase Project

> Supabase is the database (PostgreSQL) and authentication system.
> Both skplore (storefront) and skplore-admin share the SAME Supabase project.

### 1a. Create account and project

1. Go to https://supabase.com -> Start your project
2. Sign up / log in
3. Click New Project
4. Fill in:
   - Project name: skplore
   - Database password: Generate a strong password and save it!
   - Region: Choose ap-south-1 Mumbai or Singapore (closest to India)
5. Click Create new project — wait ~2 minutes

### 1b. Get your API keys

1. Project Settings (gear icon) -> API
2. Copy:
   - Project URL          -> NEXT_PUBLIC_SUPABASE_URL
   - anon / public key    -> NEXT_PUBLIC_SUPABASE_ANON_KEY
   - service_role key     -> SUPABASE_SERVICE_ROLE_KEY

### 1c. Create the database schema (SQL Editor -> New Query)

IMPORTANT: Run the following SQL blocks IN ORDER.

---- Block 1: Core Tables ----
CREATE TABLE IF NOT EXISTS categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subcategories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, slug)
);

CREATE TABLE IF NOT EXISTS products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  brand            TEXT NOT NULL DEFAULT 'Skplore',
  subcategory_id   UUID REFERENCES subcategories(id) ON DELETE SET NULL,
  gender           TEXT CHECK (gender IN ('men', 'women', 'unisex')),
  price            INTEGER NOT NULL,
  original_price   INTEGER,
  description      TEXT,
  sizes            TEXT[] DEFAULT '{}',
  colors           TEXT[] DEFAULT '{}',
  badge            TEXT CHECK (badge IN ('NEW', 'TRENDING', 'BESTSELLER', 'EXCLUSIVE', 'SALE')),
  atmosphere_theme TEXT DEFAULT 'default',
  is_active        BOOLEAN DEFAULT TRUE,
  product_code     TEXT UNIQUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url     TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  color_tag     TEXT DEFAULT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

---- Block 2: Seed Categories ----
INSERT INTO categories (name, slug) VALUES
  ('Clothing', 'clothing'),
  ('Footwear', 'footwear'),
  ('Accessories', 'accessories')
ON CONFLICT (slug) DO NOTHING;

WITH cat AS (SELECT id FROM categories WHERE slug = 'clothing')
INSERT INTO subcategories (category_id, name, slug)
SELECT cat.id, sub.name, sub.slug FROM cat,
  (VALUES ('T-Shirts','t-shirts'),('Shirts','shirts'),('Jeans','jeans'),
          ('Trousers','trousers'),('Jackets','jackets'),('Kurtas','kurtas'),
          ('Dresses','dresses'),('Co-ords','co-ords')) AS sub(name, slug)
ON CONFLICT DO NOTHING;

WITH cat AS (SELECT id FROM categories WHERE slug = 'footwear')
INSERT INTO subcategories (category_id, name, slug)
SELECT cat.id, sub.name, sub.slug FROM cat,
  (VALUES ('Sneakers','sneakers'),('Formal Shoes','formal-shoes'),
          ('Sandals','sandals'),('Boots','boots'),
          ('Heels','heels'),('Flats','flats')) AS sub(name, slug)
ON CONFLICT DO NOTHING;

WITH cat AS (SELECT id FROM categories WHERE slug = 'accessories')
INSERT INTO subcategories (category_id, name, slug)
SELECT cat.id, sub.name, sub.slug FROM cat,
  (VALUES ('Watches','watches'),('Bags','bags'),
          ('Belts','belts'),('Sunglasses','sunglasses')) AS sub(name, slug)
ON CONFLICT DO NOTHING;

---- Block 3: Performance Indexes ----
-- Run the full content of: supabase/migrations/001_performance_indexes.sql

---- Block 4: Product Code Auto-Generator (SKP-XXXX) ----
-- Run the full content of: supabase/migrations/002_add_product_code.sql

---- Block 5: Row Level Security ----
ALTER TABLE categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read categories"     ON categories     FOR SELECT USING (true);
CREATE POLICY "Public read subcategories"  ON subcategories  FOR SELECT USING (true);
CREATE POLICY "Public read products"       ON products       FOR SELECT USING (is_active = true);
CREATE POLICY "Public read product_images" ON product_images FOR SELECT USING (true);

### 1d. Create Admin Auth User

1. Supabase Dashboard -> Authentication -> Users -> Add user
2. Enter your admin email and strong password
3. This is the login for skplore-admin


---

## STEP 2 — Create Cloudflare R2 Bucket (Image CDN)

1. Go to https://dash.cloudflare.com -> R2 Object Storage
2. Create bucket -> Name: skplore-images
3. Settings -> Public Access -> Allow Access
4. Copy the public URL (pub-XXXX.r2.dev) -> CLOUDFLARE_PUBLIC_DOMAIN
5. Optional: Connect custom domain images.yourskploredomain.com via CNAME
6. R2 -> Manage R2 API tokens -> Create API Token
   - Permissions: Object Read & Write
   - Bucket: skplore-images
7. Copy:
   - Account ID          -> CLOUDFLARE_ACCOUNT_ID
   - Access Key ID       -> CLOUDFLARE_ACCESS_KEY_ID
   - Secret Access Key   -> CLOUDFLARE_SECRET_ACCESS_KEY


---

## STEP 3 — Cloudinary is DEPRECATED (Not Needed!)

> **IMPORTANT**: In earlier versions of Brand 2 Brand, Cloudinary was used for server-side image processing.
> However, **the codebase was upgraded to Cloudflare R2 + In-Browser WebP Compression**:
> 1. Images are compressed and converted to WebP directly in the admin browser (`compressImage.js` using HTML5 Canvas API).
> 2. Images are uploaded directly from the browser to **Cloudflare R2** via pre-signed S3 URLs (`r2Direct.js`).
> 3. Cloudflare R2 serves the images globally with zero egress fees.
>
> **You DO NOT need to create a Cloudinary account for Skplore!**
> Only **Supabase** (already done!) and **Cloudflare R2** are required.


---

## STEP 4 — Fill in .env.local Files

### D:\skplore\.env.local (Storefront)

```env
# Supabase Configuration (Already configured!)
NEXT_PUBLIC_SUPABASE_URL=https://skimedlufkytgemmdhsv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Storefront URL
NEXT_PUBLIC_STOREFRONT_URL=https://skplore.com
```

### D:\skplore-admin\.env.local (Admin Dashboard)

```env
# Supabase Configuration (Already configured!)
NEXT_PUBLIC_SUPABASE_URL=https://skimedlufkytgemmdhsv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_STOREFRONT_URL=http://localhost:3000

# Cloudflare R2 Configuration (Configured!)
CLOUDFLARE_ACCOUNT_ID=ea52d760ee4c346e47bd6408d97c3b04
CLOUDFLARE_ACCESS_KEY_ID=3e2165de106730cc976a4ff815f7fb57
CLOUDFLARE_SECRET_ACCESS_KEY=e3054ec8...
CLOUDFLARE_BUCKET_NAME=skplore-images
CLOUDFLARE_PUBLIC_DOMAIN=https://pub-147b6454958c46f3bfb564286d54ecf9.r2.dev
```


---

## STEP 5 — next.config.mjs Hostnames (Configured!)

Both files have already been updated with your new hostnames:
* **D:\skplore\next.config.mjs**: Added `pub-147b6454958c46f3bfb564286d54ecf9.r2.dev` and `skimedlufkytgemmdhsv.supabase.co`
* **D:\skplore-admin\next.config.mjs**: Added `pub-147b6454958c46f3bfb564286d54ecf9.r2.dev` and `skimedlufkytgemmdhsv.supabase.co`


---

## STEP 6 — Test Locally

Run these in two separate terminals:

  Terminal 1 (Storefront):
    cd D:\skplore
    npm run dev
    -> Opens at http://localhost:3000

  Terminal 2 (Admin):
    cd D:\skplore-admin
    npm run dev
    -> Opens at http://localhost:3001

Test checklist:
  [ ] Storefront loads without errors
  [ ] Admin loads and shows login page
  [ ] Login to admin with your Supabase auth user
  [ ] Admin dashboard shows (empty at first)
  [ ] Create a test product -> image uploads to R2
  [ ] Product appears on storefront


---

## STEP 7 — Deploy to Vercel (Optional)

  cd D:\skplore
  npx vercel --prod

  cd D:\skplore-admin
  npx vercel --prod

Add all .env.local variables as Environment Variables in each Vercel project settings.


---

## Dependency Map

  Supabase Project (shared)
    |-- skplore (storefront)   -> reads products, categories, images
    |-- skplore-admin          -> reads/writes products, categories, images, auth
    Tables: categories, subcategories, products, product_images

  Cloudflare R2 (skplore-images bucket)
    |-- skplore-admin          -> uploads product images via presigned URLs
    |-- skplore (storefront)   -> serves images via public CDN URL

  Cloudinary
    |-- skplore-admin          -> compresses/transforms images on upload
    |-- image_url stored in    -> Supabase product_images table


---

## Product Code Format

  All Skplore products use prefix: SKP-XXXX
  Examples: SKP-0001, SKP-0042, SKP-0100

  This is auto-generated by the database trigger in:
    supabase/migrations/002_add_product_code.sql

---
Generated for Skplore. Keep this file in the repository.
