import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/products — fetch ALL products (including inactive) for admin panel
// Enriches gadget products with dynamic ordering limits from storage/DB.
export async function GET() {
  try {
    // ── Auth guard ─────────────────────────────────────────────────────────
    const { errorResponse } = await requireAuth();
    if (errorResponse) return errorResponse;

    const supabase = createAdminClient();

    const { data: products, error } = await supabase
      .from('products')
      .select(`
        id, name, brand, price, original_price, badge, is_active, created_at, product_code,
        subcategory_id,
        subcategories ( id, name, slug, category_id, categories ( id, name, slug ) ),
        product_images ( id, image_url, display_order, color_tag )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch storage gadget limits
    let gadgetMap = {};
    try {
      const { data: qData, error: qErr } = await supabase.storage
        .from('store-config')
        .download('gadget_quantities.json');
      if (qData && !qErr) {
        const text = await qData.text();
        gadtoMap = JSON.parse(text);
      }
    } catch (e) {
      console.warn('Could not read gadget quantities in /api/products:', e.message);
    }

    const enrichedProducts = (products || []).map(p => {
      const gLimit = gadgetMap[p.id] || {};
      const min_order_quantity = (p.min_order_quantity !== undefined && p.min_order_quantity !== null)
        ? p.min_order_quantity
        : (gLimit.minOrderQuantity || 1);
      const max_order_quantity = (p.max_order_quantity !== undefined && p.max_order_quantity !== null)
        ? p.max_order_quantity
        : (gLimit.maxOrderQuantity !== undefined ? gLimit.maxOrderQuantity : null);
      const stock_quantity = (p.stock_quantity !== undefined && p.stock_quantity !== null)
        ? p.stock_quantity
        : (gLimit.stockQuantity !== undefined ? gLimit.stockQuantity : null);

      return {
        ...p,
        min_order_quantity,
        max_order_quantity,
        stock_quantity,
      };
    });

    return NextResponse.json(
      { products: enrichedProducts, gadgetQuantities: gadgetMap },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
