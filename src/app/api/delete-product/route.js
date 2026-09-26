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

export async function DELETE(request) {
  try {
    // ── Auth guard ─────────────────────────────────────────────────────────
    const { errorResponse } = await requireAuth();
    if (errorResponse) return errorResponse;

    const { productId } = await request.json();
    const supabase = createAdminClient();

    // Get all images for this product
    const { data: images } = await supabase
      .from('product_images')
      .select('image_url')
      .eq('product_id', productId);

    // Delete images from their respective storage services
    if (images?.length) {
      for (const img of images) {
        try {
          if (isCloudinaryUrl(img.image_url)) {
            const publicId = extractPublicId(img.image_url);
            if (publicId) await deleteFromCloudinary(publicId);
          } else if (isR2Url(img.image_url)) {
            const key = extractR2Key(img.image_url);
            if (key) await deleteFromR2(key);
          } else if (isSupabaseStorageUrl(img.image_url)) {
            const storagePath = extractSupabaseStoragePath(img.image_url);
            if (storagePath) {
              await supabase.storage.from('product-images').remove([storagePath]);
            }
          }
        } catch (err) {
          console.error('Image cleanup error:', err.message);
        }
      }
    }

    // Delete product (cascade deletes product_images rows)
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
