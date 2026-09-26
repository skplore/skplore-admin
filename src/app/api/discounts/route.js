import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/requireAuth';

const DEFAULT_DISCOUNTS = {
  clothing: 10,
  footwear: 10,
  accessories: 10,
  gadgets: 15,
};

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from('store-config')
      .download('discounts.json');

    if (error || !data) {
      return NextResponse.json({ discounts: DEFAULT_DISCOUNTS });
    }

    const text = await data.text();
    const discounts = JSON.parse(text);
    return NextResponse.json({ discounts: { ...DEFAULT_DISCOUNTS, ...discounts } });
  } catch (err) {
    console.error('Error fetching discounts:', err);
    return NextResponse.json({ discounts: DEFAULT_DISCOUNTS });
  }
}

export async function POST(request) {
  try {
    const { errorResponse } = await requireAuth();
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { discounts } = body;

    if (!discounts || typeof discounts !== 'object') {
      return NextResponse.json({ error: 'Invalid discounts data' }, { status: 400 });
    }

    // Clean and validate numbers
    const cleanDiscounts = {};
    for (const [cat, val] of Object.entries(discounts)) {
      const num = Number(val);
      cleanDiscounts[cat] = isNaN(num) ? 0 : Math.max(0, Math.min(100, Math.round(num)));
    }

    const supabase = createAdminClient();

    // Ensure bucket exists
    await supabase.storage.createBucket('store-config', { public: true }).catch(() => {});

    // Save discounts.json
    const payload = JSON.stringify(cleanDiscounts, null, 2);
    const { error: uploadError } = await supabase.storage
      .from('store-config')
      .upload('discounts.json', payload, {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, discounts: cleanDiscounts });
  } catch (err) {
    console.error('Error saving discounts:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
