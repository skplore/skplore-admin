import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');

    const supabase = createAdminClient();

    // 1. Fetch from store-config/gadget_quantities.json via public CDN first (100% real-time)
    let quantitiesMap = {};
    try {
      const cdnUrl = `https://skimedlufkytgemmdhsv.supabase.co/storage/v1/object/public/store-config/gadget_quantities.json?t=${Date.now()}`;
      const cdnRes = await fetch(cdnUrl, { cache: 'no-store' });
      if (cdnRes.ok) {
        quantitiesMap = await cdnRes.json();
      }
    } catch (e) {
      console.warn('CDN fetch failed in /api/gadget-limits, falling back to storage download:', e.message);
    }

    if (Object.keys(quantitiesMap).length === 0) {
      try {
        const { data, error } = await supabase.storage
          .from('store-config')
          .download('gadget_quantities.json');
        if (data && !error) {
          const text = await data.text();
          quantitiesMap = JSON.parse(text);
        }
      } catch (e) {
        console.warn('Error reading gadget_quantities.json in API:', e.message);
      }
    }

    // 2. If a specific productId was requested
    if (productId) {
      const fromStorage = quantitiesMap[productId] || quantitiesMap[productId.toLowerCase()] || {};
      let limits = {
        minOrderQuantity: fromStorage.minOrderQuantity !== undefined ? fromStorage.minOrderQuantity : 1,
        maxOrderQuantity: fromStorage.maxOrderQuantity !== undefined ? fromStorage.maxOrderQuantity : null,
        stockQuantity: fromStorage.stockQuantity !== undefined ? fromStorage.stockQuantity : null,
      };

      // Native Postgres columns fallback
      try {
        const { data: prod } = await supabase
          .from('products')
          .select('min_order_quantity, max_order_quantity, stock_quantity')
          .eq('id', productId)
          .single();

        if (prod) {
          if (prod.min_order_quantity !== null && prod.min_order_quantity !== undefined) {
            limits.minOrderQuantity = prod.min_order_quantity;
          }
          if (prod.max_order_quantity !== null && prod.max_order_quantity !== undefined) {
            limits.maxOrderQuantity = prod.max_order_quantity;
          }
          if (prod.stock_quantity !== null && prod.stock_quantity !== undefined) {
            limits.stockQuantity = prod.stock_quantity;
          }
        }
      } catch (err) {}

      return NextResponse.json(
        { productId, ...limits },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
      );
    }

    // Return the full map
    return NextResponse.json(
      { quantities: quantitiesMap },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (err) {
    console.error('API /api/gadget-limits error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
