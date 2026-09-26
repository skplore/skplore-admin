/**
 * /api/upload-product
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a new product row in the database.
 * 
 * Supports dynamic gadget ordering limits (minOrderQuantity, maxOrderQuantity,
 * stockQuantity) with dual-layer persistence (PostgreSQL + store-config storage).
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/requireAuth';

export async function POST(request) {
  try {
    // ── Auth guard ─────────────────────────────────────────────────────────
    const { errorResponse } = await requireAuth();
    if (errorResponse) return errorResponse;

    const supabase = createAdminClient();
    const body = await request.json();

    // ── Extract product fields ──────────────────────────────
    const name          = body.name;
    const brand         = body.brand || 'Skplore';
    const subcategoryId = body.subcategoryId;
    const gender        = body.gender || null;
    const price         = parseInt(body.price);
    const originalPrice = body.originalPrice ? parseInt(body.originalPrice) : null;
    const description   = body.description || null;
    const sizes         = body.sizes || [];
    const colors        = body.colors || [];
    const badge         = body.badge || null;
    const atmosphereTheme = body.atmosphereTheme || 'default';

    // ── Gadget quantity & stock limits ──────────────────────
    const minOrderQuantity = body.minOrderQuantity ? Math.max(1, parseInt(body.minOrderQuantity, 10)) : 1;
    const maxOrderQuantity = body.maxOrderQuantity ? parseInt(body.maxOrderQuantity, 10) : null;
    const stockQuantity    = (body.stockQuantity !== null && body.stockQuantity !== undefined && body.stockQuantity !== '')
      ? parseInt(body.stockQuantity, 10)
      : null;

    if (!name || !price || !subcategoryId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // ── Generate unique product code (SKP-XXXX) ────────────
    const { data: existingCodes } = await supabase
      .from('products')
      .select('product_code')
      .like('product_code', 'SKP-%')
      .order('product_code', { ascending: false })
      .limit(1);

    let nextSeq = 1;
    if (existingCodes && existingCodes.length > 0 && existingCodes[0].product_code) {
      const lastCode = existingCodes[0].product_code;
      const lastNum = parseInt(lastCode.replace('SKP-', ''), 10);
      if (!isNaN(lastNum)) nextSeq = lastNum + 1;
    }
    const productCode = `SKP-${String(nextSeq).padStart(4, '0')}`;

    // ── Insert product row ──────────────────────────────────
    const insertPayload = {
      name,
      brand,
      subcategory_id: subcategoryId,
      gender,
      price,
      original_price: originalPrice,
      description,
      sizes,
      colors,
      badge,
      atmosphere_theme: atmosphereTheme,
      is_active: true,
      product_code: productCode,
      min_order_quantity: minOrderQuantity,
      max_order_quantity: maxOrderQuantity,
      stock_quantity: stockQuantity,
    };

    let { data: product, error: prodErr } = await supabase
      .from('products')
      .insert(insertPayload)
      .select()
      .single();

    // If native columns do not exist yet in Postgres, fallback and insert without them
    if (prodErr && (prodErr.code === '42703' || prodErr.message?.includes('column'))) {
      delete insertPayload.min_order_quantity;
      delete insertPayload.max_order_quantity;
      delete insertPayload.stock_quantity;
      const retry = await supabase
        .from('products')
        .insert(insertPayload)
        .select()
        .single();
      product = retry.data;
      prodErr = retry.error;
    }

    if (prodErr) {
      console.error('Product insert error:', prodErr);
      return NextResponse.json({ error: prodErr.message }, { status: 500 });
    }

    // ── Dual-layer persistence: update store-config/gadget_quantities.json ──
    if (product?.id) {
      try {
        const { data: qData } = await supabase.storage.from('store-config').download('gadget_quantities.json');
        let qMap = {};
        if (qData) {
          try { qMap = JSON.parse(await qData.text()); } catch (e) {}
        }
        qMap[product.id] = { minOrderQuantity, maxOrderQuantity, stockQuantity };
        await supabase.storage.from('store-config').upload('gadget_quantities.json', JSON.stringify(qMap, null, 2), {
          upsert: true,
          contentType: 'application/json',
        });
      } catch (err) {
        console.warn('Could not update gadget_quantities.json storage:', err.message);
      }
    }

    console.log(`✅ Product created: ${product.id} — "${name}" [${productCode}] (Min: ${minOrderQuantity}, Max: ${maxOrderQuantity || '∞'}, Stock: ${stockQuantity || '—'})`);

    return NextResponse.json({ productId: product.id, productCode });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
