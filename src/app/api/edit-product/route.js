/**
 * /api/edit-product
 * ─────────────────────────────────────────────────────────────────────────────
 * Updates an existing product's metadata and handles image deletions.
 * Supports dynamic gadget ordering limits (minOrderQuantity, maxOrderQuantity, stockQuantity).
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/requireAuth';
import {
  deleteFromCloudinary,
  extractPublicId,
  isCloudinaryUrl,
  isSupabaseStorageUrl,
  extractSupabaseStoragePath,
} from '@/lib/cloudinary';

export async function PUT(request) {
  try {
    // ── Auth guard ─────────────────────────────────────────────────────────
    const { errorResponse } = await requireAuth();
    if (errorResponse) return errorResponse;

    const supabase = createAdminClient();
    const body = await request.json();

    const productId     = body.productId;
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
    const removedImageIds = body.removedImageIds || [];

    // ── Gadget quantity & stock limits ──────────────────────
    const minOrderQuantity = body.minOrderQuantity ? Math.max(1, parseInt(body.minOrderQuantity, 10)) : 1;
    const maxOrderQuantity = body.maxOrderQuantity ? parseInt(body.maxOrderQuantity, 10) : null;
    const stockQuantity    = (body.stockQuantity !== null && body.stockQuantity !== undefined && body.stockQuantity !== '')
      ? parseInt(body.stockQuantity, 10)
      : null;

    if (!productId || !name || !price || !subcategoryId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // ── Update product row ──────────────────────────────────
    const updatePayload = {
      name, brand, subcategory_id: subcategoryId, gender, price,
      original_price: originalPrice, description, sizes, colors,
      badge, atmosphere_theme: atmosphereTheme,
      min_order_quantity: minOrderQuantity,
      max_order_quantity: maxOrderQuantity,
      stock_quantity: stockQuantity,
    };

    let { error: updateErr } = await supabase
      .from('products')
      .update(updatePayload)
      .eq('id', productId);

    // Fallback if columns not yet added to Postgres table
    if (updateErr && (updateErr.code === '42703' || updateErr.message?.includes('column'))) {
      delete updatePayload.min_order_quantity;
      delete updatePayload.max_order_quantity;
      delete updatePayload.stock_quantity;
      const retry = await supabase
        .from('products')
        .update(updatePayload)
        .eq('id', productId);
      updateErr = retry.error;
    }

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    // ── Dual-layer persistence: update store-config/gadget_quantities.json ──
    try {
      const { data: qData } = await supabase.storage.from('store-config').download('gadget_quantities.json');
      let qMap = {};
      if (qData) {
        try { qMap = JSON.parse(await qData.text()); } catch (e) {}
      }
      qMap[productId] = { minOrderQuantity, maxOrderQuantity, stockQuantity };
      await supabase.storage.from('store-config').upload('gadget_quantities.json', JSON.stringify(qMap, null, 2), {
        upsert: true,
        contentType: 'application/json',
      });
    } catch (err) {
      console.warn('Could not update gadget_quantities.json storage:', err.message);
    }

    console.log(`✅ Product updated: ${productId} — "${name}" (Min: ${minOrderQuantity}, Max: ${maxOrderQuantity || '∞'}, Stock: ${stockQuantity || '—'})`);

    const imageResults = { deleted: 0 };

    // ── Remove deleted images ───────────────────────────────
    for (const imgId of removedImageIds) {
      const { data: img } = await supabase
        .from('product_images')
        .select('image_url')
        .eq('id', imgId)
        .single();

      if (img?.image_url) {
        try {
          if (isCloudinaryUrl(img.image_url)) {
            const publicId = extractPublicId(img.image_url);
            if (publicId) await deleteFromCloudinary(publicId);
          } else if (isSupabaseStorageUrl(img.image_url)) {
            const storagePath = extractSupabaseStoragePath(img.image_url);
            if (storagePath) await supabase.storage.from('product-images').remove([storagePath]);
          }
        } catch (err) {
          console.error('Image delete error:', err.message);
        }
      }
      await supabase.from('product_images').delete().eq('id', imgId);
      imageResults.deleted++;
    }

    return NextResponse.json({ success: true, images: imageResults });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
