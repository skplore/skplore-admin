'use client';

import { useState, useEffect, useRef, use } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { compressImage, formatBytes } from '@/lib/compressImage';
import { uploadToR2Direct } from '@/lib/r2Direct';

// ── Smart Gender Mapper for Subcategories ──────────────────────────────────
function getSubcategoryGender(sub, categorySlug) {
  if (sub.gender) return sub.gender;
  const slug = (sub.slug || '').toLowerCase();
  if (['heels', 'flats', 'wedges', 'dresses', 'lehengas', 'sarees', 'co-ords', 'skirts', 'tops', 'handbags'].includes(slug)) {
    return 'women';
  }
  if (['formal-shoes', 'loafers', 'ties', 'kurta-pajama'].includes(slug)) {
    return 'men';
  }
  if (categorySlug === 'gadgets') {
    return 'unisex';
  }
  return 'both';
}

function getSizePreset(subcategoryName) {
  const n = (subcategoryName || '').toLowerCase();
  if (/case|phone|guard|screen|audio|sound|tech|charge|cable/.test(n))
    return { label: 'Device / Phone Model Compatibility', sizes: ['iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16', 'iPhone 15 Pro Max', 'iPhone 15', 'Galaxy S25 Ultra', 'Galaxy S24', 'OnePlus 13', 'Universal'] };
  if (/shirt|top|t-shirt|tee|kurta|blouse|polo|sweatshirt|hoodie|jacket|coat|blazer/.test(n))
    return { label: 'Clothing Sizes', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] };
  if (/pant|trouser|jean|chino|short|skirt|legging/.test(n))
    return { label: 'Bottom Sizes (waist)', sizes: ['26', '28', '30', '32', '34', '36', '38', '40', '42'] };
  if (/shoe|sneaker|boot|sandal|slipper|footwear|loafer|heel/.test(n))
    return { label: 'Shoe Sizes (UK)', sizes: ['5', '6', '7', '8', '9', '10', '11', '12'] };
  if (/bag|wallet|belt|watch|jewel|accessory|accessories|cap|hat|sock/.test(n))
    return { label: 'Sizes', sizes: ['Free Size', 'One Size'] };
  return { label: 'Sizes', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] };
}

const COMMON_COLORS = [
  { name: 'Black', hex: '#111111' }, { name: 'White', hex: '#f5f5f5' },
  { name: 'Navy', hex: '#1e3a5f' }, { name: 'Red', hex: '#dc2626' },
  { name: 'Maroon', hex: '#7f1d1d' }, { name: 'Olive', hex: '#5f6b1e' },
  { name: 'Green', hex: '#16a34a' }, { name: 'Blue', hex: '#2563eb' },
  { name: 'Sky Blue', hex: '#0ea5e9' }, { name: 'Grey', hex: '#6b7280' },
  { name: 'Brown', hex: '#92400e' }, { name: 'Beige', hex: '#d4a574' },
  { name: 'Pink', hex: '#ec4899' }, { name: 'Purple', hex: '#7c3aed' },
  { name: 'Yellow', hex: '#eab308' }, { name: 'Orange', hex: '#ea580c' },
];

export default function AdminEditProductPage({ params }) {
  const resolvedParams = use(params);
  const productId = resolvedParams.id;
  const supabase = createClient();
  const router = useRouter();
  const fileInputRef = useRef(null);

  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [selectedSubName, setSelectedSubName] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');

  const [form, setForm] = useState({
    name: '', brand: 'Skplore', description: '', price: '', originalPrice: '',
    categoryId: '', subcategoryId: '', gender: '', badge: '', atmosphereTheme: 'default',
    minOrderQuantity: 1, maxOrderQuantity: '', stockQuantity: '',
  });

  const [sizes, setSizes] = useState([]);
  const [customSizeInput, setCustomSizeInput] = useState('');
  const [colors, setColors] = useState([]);
  const [customColorInput, setCustomColorInput] = useState('');
  const [existingImages, setExistingImages] = useState([]);
  const [newImages, setNewImages] = useState([]);
  const [removedImageIds, setRemovedImageIds] = useState([]);
  const [productCode, setProductCode] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: cats } = await supabase.from('categories').select('*, subcategories(*)').order('name');
      setCategories(cats || []);
      
      const { data: product } = await supabase.from('products')
        .select('*, subcategories(id,name,slug,category_id,categories(id,name,slug)), product_images(id,image_url,display_order,color_tag)')
        .eq('id', productId).single();
      
      if (!product) { router.push('/products'); return; }
      
      const catId = product.subcategories?.categories?.id || '';
      const cat = cats?.find(c => c.id === catId);
      setSubcategories(cat?.subcategories || []);
      setSelectedSubName(product.subcategories?.name || '');
      setProductCode(product.product_code || '');

      // Multi-layer dynamic gadget limits fetch:
      // 1. Direct public storage CDN fetch with cache-busting (bypasses browser cache & proxy)
      // 2. /api/gadget-limits endpoint
      // 3. Direct supabase client storage download
      // 4. Native Postgres columns
      let minOrderQuantity = 1;
      let maxOrderQuantity = '';
      let stockQuantity = '';
      let limitsLoaded = false;

      // Layer 1: Direct public storage CDN fetch with cache-busting
      try {
        const sUrl = `https://skimedlufkytgemmdhsv.supabase.co/storage/v1/object/public/store-config/gadget_quantities.json?t=${Date.now()}`;
        const sRes = await fetch(sUrl, { cache: 'no-store' });
        if (sRes.ok) {
          const sMap = await sRes.json();
          const pLimit = sMap && (sMap[productId] || sMap[productId.toLowerCase()]);
          if (pLimit) {
            if (pLimit.minOrderQuantity !== undefined && pLimit.minOrderQuantity !== null) {
              minOrderQuantity = pLimit.minOrderQuantity;
              limitsLoaded = true;
            }
            if (pLimit.maxOrderQuantity !== undefined && pLimit.maxOrderQuantity !== null) {
              maxOrderQuantity = pLimit.maxOrderQuantity;
              limitsLoaded = true;
            }
            if (pLimit.stockQuantity !== undefined && pLimit.stockQuantity !== null) {
              stockQuantity = pLimit.stockQuantity;
              limitsLoaded = true;
            }
          }
        }
      } catch (err) {
        console.warn('Storage limits fetch note:', err);
      }

      // Layer 2: API route
      if (!limitsLoaded) {
        try {
          const limitRes = await fetch(`/api/gadget-limits?productId=${productId}&_t=${Date.now()}`, {
            cache: 'no-store',
          });
          if (limitRes.ok) {
            const lData = await limitRes.json();
            if (lData.minOrderQuantity !== undefined && lData.minOrderQuantity !== null) {
              minOrderQuantity = lData.minOrderQuantity;
              limitsLoaded = true;
            }
            if (lData.maxOrderQuantity !== undefined && lData.maxOrderQuantity !== null) {
              maxOrderQuantity = lData.maxOrderQuantity;
              limitsLoaded = true;
            }
            if (lData.stockQuantity !== undefined && lData.stockQuantity !== null) {
              stockQuantity = lData.stockQuantity;
              limitsLoaded = true;
            }
          }
        } catch (err) {
          console.warn('/api/gadget-limits fetch note:', err);
        }
      }

      // Layer 3: Supabase client download
      if (!limitsLoaded) {
        try {
          const { data: qBlob } = await supabase.storage.from('store-config').download('gadget_quantities.json');
          if (qBlob) {
            const qMap = JSON.parse(await qBlob.text());
            const pLimit = qMap && (qMap[productId] || qMap[productId.toLowerCase()]);
            if (pLimit) {
              if (pLimit.minOrderQuantity !== undefined && pLimit.minOrderQuantity !== null) {
                minOrderQuantity = pLimit.minOrderQuantity;
              }
              if (pLimit.maxOrderQuantity !== undefined && pLimit.maxOrderQuantity !== null) {
                maxOrderQuantity = pLimit.maxOrderQuantity;
              }
              if (pLimit.stockQuantity !== undefined && pLimit.stockQuantity !== null) {
                stockQuantity = pLimit.stockQuantity;
              }
            }
          }
        } catch (err) {}
      }

      // Layer 4: Native Postgres columns
      if (product.min_order_quantity !== undefined && product.min_order_quantity !== null) {
        minOrderQuantity = product.min_order_quantity;
      }
      if (product.max_order_quantity !== undefined && product.max_order_quantity !== null) {
        maxOrderQuantity = product.max_order_quantity;
      }
      if (product.stock_quantity !== undefined && product.stock_quantity !== null) {
        stockQuantity = product.stock_quantity;
      }

      console.log('✅ Loaded product limits for edit:', { productId, minOrderQuantity, maxOrderQuantity, stockQuantity });

      setForm({
        name: product.name || '',
        brand: product.brand || 'Skplore',
        description: product.description || '',
        price: product.price?.toString() || '',
        originalPrice: product.original_price?.toString() || '',
        categoryId: catId,
        subcategoryId: product.subcategory_id || '',
        gender: product.gender || '',
        badge: product.badge || '',
        atmosphereTheme: product.atmosphere_theme || 'default',
        minOrderQuantity,
        maxOrderQuantity,
        stockQuantity,
      });

      setSizes(product.sizes || []);
      setColors(product.colors || []);
      setExistingImages((product.product_images || []).sort((a, b) => a.display_order - b.display_order));
      setLoading(false);
    };
    load();
  }, [productId]);

  useEffect(() => {
    if (form.categoryId) {
      const cat = categories.find(c => c.id === form.categoryId);
      setSubcategories(cat?.subcategories || []);
    }
  }, [form.categoryId, categories]);

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubChange = (e) => {
    const id = e.target.value;
    const sub = subcategories.find(s => s.id === id);
    handleChange('subcategoryId', id);
    setSelectedSubName(sub?.name || '');
  };

  const activeCategory = categories.find(c => c.id === form.categoryId);
  const isGadget = activeCategory?.slug === 'gadgets' || 
                   activeCategory?.name?.toLowerCase() === 'gadgets' || 
                   form.atmosphereTheme === 'gadgets';

  const visibleSubcategories = subcategories.filter(sub => {
    if (isGadget) return true;
    if (!form.gender || form.gender === 'unisex') return true;
    const g = getSubcategoryGender(sub, activeCategory?.slug);
    return g === 'both' || g === form.gender || g === 'unisex';
  });

  const sizePreset = getSizePreset(selectedSubName);
  const toggleSize = (s) => setSizes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  const toggleColor = (c) => setColors(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const addCustomSize = () => {
    const v = customSizeInput.trim();
    if (v && !sizes.includes(v)) { setSizes(prev => [...prev, v]); setCustomSizeInput(''); }
  };
  const addCustomColor = () => {
    const v = customColorInput.trim();
    if (v && !colors.includes(v)) { setColors(prev => [...prev, v]); setCustomColorInput(''); }
  };

  const handleFilesSelected = async (e) => {
    const files = Array.from(e.target.files);
    e.target.value = '';
    if (!files.length) return;
    setCompressing(true);
    try {
      const results = await Promise.all(files.map(f => compressImage(f)));
      setNewImages(prev => [
        ...prev,
        ...results.map(r => ({
          file:           r.file,
          preview:        URL.createObjectURL(r.file),
          colorTag:       '',
          originalSize:   r.originalSize,
          compressedSize: r.compressedSize,
        })),
      ]);
    } finally {
      setCompressing(false);
    }
  };

  const handleRemoveExisting = (imgId) => {
    setRemovedImageIds(prev => [...prev, imgId]);
  };

  const handleUndoRemove = (imgId) => {
    setRemovedImageIds(prev => prev.filter(id => id !== imgId));
  };

  // Images that will remain after save (existing minus removed)
  const activeExistingCount = existingImages.filter(img => !removedImageIds.includes(img.id)).length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price || !form.subcategoryId) { alert('Please fill required fields.'); return; }
    setSaving(true);
    setUploadProgress('');
    try {
      // ── Step 1: Update product metadata + limits + delete removed images ──
      const metaRes = await fetch('/api/edit-product', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          name: form.name,
          brand: form.brand,
          subcategoryId: form.subcategoryId,
          gender: isGadget ? 'unisex' : form.gender,
          price: form.price,
          originalPrice: form.originalPrice,
          description: form.description,
          sizes,
          colors,
          badge: form.badge,
          minOrderQuantity: form.minOrderQuantity ? Math.max(1, parseInt(form.minOrderQuantity, 10)) : 1,
          maxOrderQuantity: form.maxOrderQuantity || null,
          stockQuantity: form.stockQuantity !== '' ? form.stockQuantity : null,
          atmosphereTheme: isGadget ? 'gadgets' : form.atmosphereTheme,
          removedImageIds,
        }),
      });

      const metaJson = await metaRes.json();
      if (!metaRes.ok) throw new Error(metaJson.error || 'Save failed');

      // ── Step 2: Upload new images directly Browser → Cloudflare R2 ──
      const imageErrors = [];
      if (newImages.length > 0) {
        const folder = `products/${productId}`;
        const startOrder = activeExistingCount;

        for (let i = 0; i < newImages.length; i++) {
          const img = newImages[i];
          if (!img.file) continue;
          try {
            setUploadProgress(`Uploading image ${i + 1}/${newImages.length}...`);
            const ext = img.file.name.split('.').pop() || 'webp';
            const result = await uploadToR2Direct(img.file, folder, `${Date.now()}_${i}.${ext}`);

            await fetch('/api/save-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                productId,
                imageUrl: result.url,
                displayOrder: startOrder + i,
                colorTag: img.colorTag || null,
              }),
            });
          } catch (err) {
            imageErrors.push(`Image ${i + 1}: ${err.message}`);
          }
        }
      }

      if (imageErrors.length > 0) {
        alert(`Product saved, but ${imageErrors.length} image(s) failed to upload:\n\n${imageErrors.join('\n')}\n\nTry again from the Edit page.`);
      }

      router.push('/products');
      router.refresh();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
      setUploadProgress('');
    }
  };

  if (loading) return <div className="admin-loading"><span className="admin-spinner" /> Loading product...</div>;

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h2>Edit Product</h2>
          <p className="admin-page-subtitle">
            {form.name ? `Editing "${form.name}"` : 'Update product details'}
            {productCode && <span className="admin-code-badge">#{productCode}</span>}
          </p>
        </div>
        <button className="admin-btn admin-btn-ghost" onClick={() => router.back()}>← Back</button>
      </div>

      <form onSubmit={handleSubmit} className="admin-new-product-form">
        {/* ── SECTION 1: Product Info ── */}
        <div className="admin-form-section">
          <div className="admin-form-section-title"><span className="admin-form-section-num">1</span> Product Info</div>
          <div className="admin-form-section-body">
            <div className="admin-form-group">
              <label className="admin-form-label">Product Name *</label>
              <input className="admin-form-input admin-form-input-lg" value={form.name}
                onChange={e => handleChange('name', e.target.value)} required />
            </div>
            <div className="admin-form-row-3">
              <div className="admin-form-group">
                <label className="admin-form-label">Brand</label>
                <input className="admin-form-input" value={form.brand} onChange={e => handleChange('brand', e.target.value)} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Gender</label>
                <select className="admin-form-select" value={isGadget ? 'unisex' : form.gender} onChange={e => handleChange('gender', e.target.value)} disabled={isGadget}>
                  {isGadget ? (
                    <option value="unisex">Unisex (Gadgets)</option>
                  ) : (
                    <>
                      <option value="">Unisex / None</option>
                      <option value="men">Men</option>
                      <option value="women">Women</option>
                    </>
                  )}
                </select>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Badge</label>
                <select className="admin-form-select" value={form.badge} onChange={e => handleChange('badge', e.target.value)}>
                  <option value="">None</option>
                  <option value="BESTSELLER">Bestseller</option>
                  <option value="NEW">New</option>
                  <option value="TRENDING">Trending</option>
                  <option value="EXCLUSIVE">Exclusive</option>
                </select>
              </div>
            </div>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-form-label">Selling Price (₹) *</label>
                <input type="number" className="admin-form-input" value={form.price} onChange={e => handleChange('price', e.target.value)} required />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Original Price (₹)</label>
                <input type="number" className="admin-form-input" value={form.originalPrice} onChange={e => handleChange('originalPrice', e.target.value)} />
              </div>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Description</label>
              <textarea className="admin-form-textarea" value={form.description} onChange={e => handleChange('description', e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── SECTION 2: Category ── */}
        <div className="admin-form-section">
          <div className="admin-form-section-title"><span className="admin-form-section-num">2</span> Category</div>
          <div className="admin-form-section-body">
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-form-label">Category *</label>
                <select className="admin-form-select" value={form.categoryId} onChange={e => handleChange('categoryId', e.target.value)} required>
                  <option value="">Select...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Subcategory *</label>
                <select className="admin-form-select" value={form.subcategoryId} onChange={handleSubChange} required disabled={!form.categoryId}>
                  <option value="">Select...</option>
                  {visibleSubcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Atmosphere Theme</label>
              <div className="admin-chip-row">
                {['default', 'clothing', 'footwear', 'accessories', 'gadgets'].map(t => (
                  <button key={t} type="button" className={`admin-chip ${form.atmosphereTheme === t ? 'selected' : ''}`}
                    onClick={() => handleChange('atmosphereTheme', t)}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION: Order Quantity & Stock Limits (Dynamic Gadget Controls) ── */}
        <div className="admin-form-section" style={{
          borderLeft: isGadget ? '4px solid #6366f1' : '1px solid var(--admin-border)',
          background: isGadget ? 'linear-gradient(180deg, rgba(99,102,241,0.04) 0%, rgba(255,255,255,0) 100%)' : '#f8fafc',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '24px',
        }}>
          <div className="admin-form-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span className="admin-form-section-num" style={{ background: isGadget ? '#6366f1' : '#64748b', color: '#fff' }}>
                ⚡
              </span>
              <strong>Gadget Order Quantity &amp; Stock Limits</strong>
              {isGadget && <span className="admin-form-section-hint" style={{ color: '#6366f1', fontWeight: 700, marginLeft: '8px' }}>— Active for Gadgets</span>}
            </div>
          </div>
          <div className="admin-form-section-body" style={{ marginTop: '14px' }}>
            <p className="admin-hint-text" style={{ marginBottom: '16px', color: '#475569' }}>
              Set dynamic ordering rules. Customers will not be allowed to select or place an order below the minimum or above the upper limit / total available stock.
            </p>

            <div className="admin-form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div className="admin-form-group">
                <label className="admin-form-label" style={{ fontWeight: 600 }}>
                  Minimum Order Quantity *
                  <span style={{ fontSize: '11px', color: '#6366f1', marginLeft: '6px' }}>
                    (Default starts here)
                  </span>
                </label>
                <input
                  type="number"
                  min="1"
                  className="admin-form-input"
                  value={form.minOrderQuantity !== undefined && form.minOrderQuantity !== '' ? form.minOrderQuantity : 1}
                  onChange={e => handleChange('minOrderQuantity', Math.max(1, parseInt(e.target.value, 10) || 1))}
                  placeholder="e.g. 3"
                  required
                />
                <span className="admin-field-hint" style={{ fontSize: '11px', color: 'var(--admin-text-muted)', marginTop: '4px' }}>
                  Customer cannot order less than this amount.
                </span>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label" style={{ fontWeight: 600 }}>
                  Upper Limit / Max Order
                  <span style={{ fontSize: '11px', color: 'var(--admin-text-muted)', marginLeft: '6px' }}>
                    (Optional)
                  </span>
                </label>
                <input
                  type="number"
                  min="1"
                  className="admin-form-input"
                  value={form.maxOrderQuantity !== undefined && form.maxOrderQuantity !== null ? form.maxOrderQuantity : ''}
                  onChange={e => handleChange('maxOrderQuantity', e.target.value ? Math.max(1, parseInt(e.target.value, 10) || 1) : '')}
                  placeholder="e.g. 10 (Leave blank for no max limit)"
                />
                <span className="admin-field-hint" style={{ fontSize: '11px', color: 'var(--admin-text-muted)', marginTop: '4px' }}>
                  Maximum units customer can buy in a single order.
                </span>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label" style={{ fontWeight: 600 }}>
                  Total Available Quantity / Stock
                  <span style={{ fontSize: '11px', color: 'var(--admin-text-muted)', marginLeft: '6px' }}>
                    (Optional)
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  className="admin-form-input"
                  value={form.stockQuantity !== undefined && form.stockQuantity !== null ? form.stockQuantity : ''}
                  onChange={e => handleChange('stockQuantity', e.target.value !== '' ? Math.max(0, parseInt(e.target.value, 10) || 0) : '')}
                  placeholder="e.g. 50 (Total units available)"
                />
                <span className="admin-field-hint" style={{ fontSize: '11px', color: 'var(--admin-text-muted)', marginTop: '4px' }}>
                  Total units currently available in store.
                </span>
              </div>
            </div>

            {/* Live Interactive Range Preview */}
            <div style={{
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: '6px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}>
              <div style={{ fontSize: '13px', color: '#1e293b' }}>
                🛒 <strong>Live Order Range Preview:</strong> Customers can order between{' '}
                <strong style={{ color: '#dc2626' }}>{form.minOrderQuantity || 1} units</strong> and{' '}
                <strong style={{ color: '#2563eb' }}>
                  {form.maxOrderQuantity && form.stockQuantity
                    ? `${Math.min(form.maxOrderQuantity, form.stockQuantity)} units`
                    : (form.maxOrderQuantity ? `${form.maxOrderQuantity} units` : (form.stockQuantity ? `${form.stockQuantity} units` : 'No upper limit'))}
                </strong>.
              </div>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Default selector on website will open at: <strong>{form.minOrderQuantity || 1}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* ── SECTION 3: Sizes ── */}
        <div className="admin-form-section">
          <div className="admin-form-section-title"><span className="admin-form-section-num">3</span> Sizes
            {selectedSubName && <span className="admin-form-section-hint">— {sizePreset.label}</span>}
          </div>
          <div className="admin-form-section-body">
            <div className="admin-chip-grid">
              {sizePreset.sizes.map(s => (
                <button key={s} type="button" className={`admin-size-chip ${sizes.includes(s) ? 'selected' : ''}`}
                  onClick={() => toggleSize(s)}>
                  {s}{sizes.includes(s) && <span className="admin-chip-check">✓</span>}
                </button>
              ))}
            </div>
            <div className="admin-custom-add-row">
              <input className="admin-form-input" value={customSizeInput}
                onChange={e => setCustomSizeInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSize(); } }}
                placeholder="Custom size..." />
              <button type="button" className="admin-btn admin-btn-outline" onClick={addCustomSize}>+ Add</button>
            </div>
            {sizes.length > 0 && (
              <div className="admin-selected-chips">
                <span className="admin-selected-label">Selected:</span>
                {sizes.map(s => <span key={s} className="admin-tag">{s}<button type="button" onClick={() => setSizes(prev => prev.filter(x => x !== s))}>×</button></span>)}
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 4: Colours ── */}
        <div className="admin-form-section">
          <div className="admin-form-section-title"><span className="admin-form-section-num">4</span> Colours</div>
          <div className="admin-form-section-body">
            <div className="admin-color-swatches">
              {COMMON_COLORS.map(c => (
                <button key={c.name} type="button"
                  className={`admin-color-swatch ${colors.includes(c.name) ? 'selected' : ''}`}
                  style={{ '--swatch-color': c.hex }} onClick={() => toggleColor(c.name)} title={c.name}>
                  {colors.includes(c.name) && <span className="admin-swatch-check">✓</span>}
                  <span className="admin-color-tooltip">{c.name}</span>
                </button>
              ))}
            </div>
            <div className="admin-custom-add-row" style={{ marginTop: '14px' }}>
              <input className="admin-form-input" value={customColorInput}
                onChange={e => setCustomColorInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomColor(); } }}
                placeholder="Custom colour..." />
              <button type="button" className="admin-btn admin-btn-outline" onClick={addCustomColor}>+ Add</button>
            </div>
            {colors.length > 0 && (
              <div className="admin-selected-chips">
                <span className="admin-selected-label">Selected:</span>
                {colors.map(c => <span key={c} className="admin-tag">{c}<button type="button" onClick={() => setColors(prev => prev.filter(x => x !== c))}>×</button></span>)}
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 5: Images ── */}
        <div className="admin-form-section">
          <div className="admin-form-section-title"><span className="admin-form-section-num">5</span> Product Images</div>
          <div className="admin-form-section-body">
            {/* Existing Images */}
            {existingImages.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p className="admin-form-label" style={{ marginBottom: 10 }}>
                  Current Images ({existingImages.length - removedImageIds.length} active
                  {removedImageIds.length > 0 && `, ${removedImageIds.length} marked for deletion`})
                </p>
                <div className="admin-variant-images-area">
                  {existingImages.map((img, i) => {
                    const isMarkedForRemoval = removedImageIds.includes(img.id);
                    return (
                      <div key={img.id} className={`admin-image-preview-single ${isMarkedForRemoval ? 'marked-delete' : ''}`}
                        style={isMarkedForRemoval ? { opacity: 0.4, filter: 'grayscale(1)' } : {}}>
                        <img src={img.image_url} alt={`Image ${i + 1}`} />
                        {isMarkedForRemoval ? (
                          <button className="admin-image-undo-btn" type="button" onClick={() => handleUndoRemove(img.id)} title="Undo delete">
                            ↩
                          </button>
                        ) : (
                          <button className="admin-image-remove-btn" type="button" onClick={() => handleRemoveExisting(img.id)} title="Mark for removal">
                            ×
                          </button>
                        )}
                        <div className="admin-image-badge" style={isMarkedForRemoval ? { background: 'var(--admin-danger, #ef4444)' } : {}}>
                          {isMarkedForRemoval ? '🗑' : i === 0 ? 'Cover' : i + 1}
                        </div>
                        {img.color_tag && (
                          <div className="admin-compress-badge" style={{ background: 'var(--admin-primary, #6366f1)', color: '#fff' }}>
                            {img.color_tag}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Add New Images ── */}
            <div style={{ marginBottom: 8 }}>
              <p className="admin-form-label" style={{ marginBottom: 10 }}>Add New Images</p>
            </div>
            <div className="admin-variant-images-area">
              <div className="admin-image-drop-zone admin-image-drop-zone-sm" onClick={() => fileInputRef.current?.click()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="24" height="24">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <p>{compressing ? 'Optimising…' : 'Add more images'}</p>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFilesSelected} multiple accept="image/*" style={{ display: 'none' }} />
              {newImages.map((img, i) => (
                <div key={i} className="admin-image-preview-single">
                  <img src={img.preview} alt={`New ${i + 1}`} />
                  <button className="admin-image-remove-btn" type="button"
                    onClick={() => setNewImages(prev => prev.filter((_, idx) => idx !== i))}>×</button>
                  <div className="admin-image-badge" style={{ background: 'var(--admin-success, #22c55e)' }}>+{i + 1}</div>
                  {img.originalSize && (
                    <div className="admin-compress-badge">
                      {formatBytes(img.originalSize)} → {formatBytes(img.compressedSize)} ✓
                    </div>
                  )}
                  {colors.length > 0 && (
                    <select className="admin-image-color-tag" value={img.colorTag}
                      onChange={e => setNewImages(prev => prev.map((v, idx) => idx === i ? { ...v, colorTag: e.target.value } : v))}>
                      <option value="">Tag colour</option>
                      {colors.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <button type="submit" className="admin-btn admin-btn-primary admin-btn-submit" disabled={saving || compressing}>
          {saving ? <><span className="admin-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> {uploadProgress || 'Saving...'}</>
          : compressing ? <><span className="admin-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Optimising Images...</>
          : '✦ Save Changes'}
        </button>
      </form>
    </>
  );
}
