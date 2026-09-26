'use client';

import { useState, useEffect, useRef } from 'react';
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

// ── Size presets by subcategory keyword ─────────────────────────────────────
function getSizePreset(subcategoryName) {
  const n = (subcategoryName || '').toLowerCase();
  if (/heel|flat|wedge/.test(n))
    return { label: 'Women Shoe Sizes (UK)', sizes: ['3', '4', '5', '6', '7', '8', '9'] };
  if (/shoe|sneaker|boot|sandal|slipper|footwear|loafer/.test(n))
    return { label: 'Shoe Sizes (UK)', sizes: ['6', '7', '8', '9', '10', '11', '12'] };
  if (/case|phone|guard|screen|audio|sound|tech|charge|cable/.test(n))
    return { label: 'Device / Phone Model Compatibility', sizes: ['iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16', 'iPhone 15 Pro Max', 'iPhone 15', 'Galaxy S25 Ultra', 'Galaxy S24', 'OnePlus 13', 'Universal'] };
  if (/shirt|top|t-shirt|tee|kurta|blouse|polo|sweatshirt|hoodie|jacket|coat|blazer|dress|lehenga|saree|co-ord/.test(n))
    return { label: 'Clothing Sizes', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] };
  if (/pant|trouser|jean|chino|short|skirt|legging/.test(n))
    return { label: 'Bottom Sizes (waist)', sizes: ['26', '28', '30', '32', '34', '36', '38', '40', '42'] };
  if (/bag|wallet|belt|watch|jewel|accessory|accessories|cap|hat|sock/.test(n))
    return { label: 'Sizes', sizes: ['Free Size', 'One Size'] };
  return { label: 'Sizes', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] };
}

const COMMON_COLORS = [
  { name: 'Black',     hex: '#111111' },
  { name: 'White',     hex: '#f5f5f5' },
  { name: 'Navy',      hex: '#1e3a5f' },
  { name: 'Red',       hex: '#dc2626' },
  { name: 'Maroon',    hex: '#7f1d1d' },
  { name: 'Olive',     hex: '#5f6b1e' },
  { name: 'Green',     hex: '#16a34a' },
  { name: 'Blue',      hex: '#2563eb' },
  { name: 'Sky Blue',  hex: '#0ea5e9' },
  { name: 'Grey',      hex: '#6b7280' },
  { name: 'Brown',     hex: '#92400e' },
  { name: 'Beige',     hex: '#d4a574' },
  { name: 'Pink',      hex: '#ec4899' },
  { name: 'Purple',    hex: '#7c3aed' },
  { name: 'Yellow',    hex: '#eab308' },
  { name: 'Orange',    hex: '#ea580c' },
];

export default function AdminNewProductPage() {
  const supabase = createClient();
  const router = useRouter();
  const coverInputRef = useRef(null);
  const variantInputRef = useRef(null);

  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [selectedSubName, setSelectedSubName] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');

  const [form, setForm] = useState({
    name: '', brand: 'Skplore', description: '', price: '',
    originalPrice: '', categoryId: '', subcategoryId: '',
    gender: 'men', badge: '', atmosphereTheme: 'default', minOrderQuantity: 1, maxOrderQuantity: '', stockQuantity: '',
  });

  const [sizes, setSizes] = useState([]);
  const [customSizeInput, setCustomSizeInput] = useState('');
  const [colors, setColors] = useState([]);
  const [customColorInput, setCustomColorInput] = useState('');

  const [coverImage, setCoverImage] = useState(null);
  const [variantImages, setVariantImages] = useState([]);

  useEffect(() => {
    supabase.from('categories').select('*, subcategories(*)').order('name')
      .then(({ data }) => setCategories(data || []));
  }, []);

  const activeCategory = categories.find(c => c.id === form.categoryId);
  const isGadget = activeCategory?.slug === 'gadgets';

  const handleCategoryChange = (e) => {
    const catId = e.target.value;
    const cat = categories.find(c => c.id === catId);
    const gadget = cat?.slug === 'gadgets';

    setForm(prev => ({
      ...prev,
      categoryId: catId,
      subcategoryId: '',
      gender: gadget ? 'unisex' : (prev.gender === 'unisex' ? 'men' : prev.gender || 'men'),
      atmosphereTheme: gadget ? 'gadgets' : cat?.slug || 'default',
    }));
    setSubcategories(cat?.subcategories || []);
    setSelectedSubName('');
    setSizes([]);
  };

  const handleGenderChange = (newGender) => {
    setForm(prev => ({
      ...prev,
      gender: newGender,
      subcategoryId: '', // reset subcategory on gender switch to avoid mismatch
    }));
    setSelectedSubName('');
    setSizes([]);
  };

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubcategoryChange = (e) => {
    const id = e.target.value;
    const sub = subcategories.find(s => s.id === id);
    handleChange('subcategoryId', id);
    setSelectedSubName(sub?.name || '');
    setSizes([]);
  };

  // Filter subcategories smartly according to selected gender
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

  const handleCoverSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCompressing(true);
    try {
      const result = await compressImage(file);
      setCoverImage({
        file:           result.file,
        preview:        URL.createObjectURL(result.file),
        originalSize:   result.originalSize,
        compressedSize: result.compressedSize,
      });
    } finally {
      setCompressing(false);
    }
  };

  const handleVariantsSelected = async (e) => {
    const files = Array.from(e.target.files);
    e.target.value = '';
    if (!files.length) return;
    setCompressing(true);
    try {
      const results = await Promise.all(files.map(f => compressImage(f)));
      setVariantImages(prev => [
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price || !form.subcategoryId) {
      alert('Please fill: name, price, category, and subcategory.');
      return;
    }
    setLoading(true);
    setUploadProgress('');
    try {
      const productRes = await fetch('/api/upload-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          brand: form.brand || 'Skplore',
          subcategoryId: form.subcategoryId,
          gender: isGadget ? 'unisex' : form.gender,
          price: form.price,
          originalPrice: form.originalPrice,
          description: form.description,
          sizes,
          colors,
          badge: form.badge || null,
          atmosphereTheme: form.atmosphereTheme,
          minOrderQuantity: form.minOrderQuantity || 1,
          maxOrderQuantity: form.maxOrderQuantity || null,
          stockQuantity: form.stockQuantity !== '' ? form.stockQuantity : null,
        }),
      });

      if (!productRes.ok) {
        const err = await productRes.json();
        throw new Error(err.error || 'Failed to create product row');
      }

      const { productId } = await productRes.json();

      let order = 0;
      const folder = `products/${productId}`;

      if (coverImage?.file) {
        setUploadProgress('Uploading cover image to Cloudflare R2...');
        const ext = coverImage.file.name.split('.').pop() || 'webp';
        const coverResult = await uploadToR2Direct(coverImage.file, folder, `cover_${Date.now()}.${ext}`);
        await fetch('/api/save-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, imageUrl: coverResult.url, displayOrder: order++, colorTag: null }),
        });
      }

      for (let i = 0; i < variantImages.length; i++) {
        const v = variantImages[i];
        if (!v.file) continue;
        setUploadProgress(`Uploading gallery image ${i + 1} of ${variantImages.length}...`);
        const ext = v.file.name.split('.').pop() || 'webp';
        const variantResult = await uploadToR2Direct(v.file, folder, `variant_${Date.now()}_${i + 1}.${ext}`);
        await fetch('/api/save-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, imageUrl: variantResult.url, displayOrder: order++, colorTag: v.colorTag || null }),
        });
      }

      setUploadProgress('Complete! Redirecting...');
      router.push('/products');
      router.refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Add New Product</h2>
          <p className="admin-page-subtitle">Product will immediately appear in the selected world and gender section.</p>
        </div>
        <button type="button" className="admin-btn admin-btn-ghost" onClick={() => router.back()}>
          Back
        </button>
      </div>

      <form onSubmit={handleSubmit} className="admin-new-product-form">
        {/* ── SECTION 1: Basic Info ── */}
        <div className="admin-form-section">
          <div className="admin-form-section-title">
            <span className="admin-form-section-num">1</span> Basic Information
          </div>
          <div className="admin-form-section-body">
            <div className="admin-form-group">
              <label className="admin-form-label">Product Name *</label>
              <input className="admin-form-input admin-form-input-lg" value={form.name}
                onChange={e => handleChange('name', e.target.value)}
                placeholder="e.g. Slim Fit Linen Shirt, High Heels, Wireless Earbuds..." required />
            </div>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-form-label">Brand</label>
                <input className="admin-form-input" value={form.brand}
                  onChange={e => handleChange('brand', e.target.value)} />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Badge</label>
                <select className="admin-form-select" value={form.badge}
                  onChange={e => handleChange('badge', e.target.value)}>
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
                <input type="number" className="admin-form-input" value={form.price}
                  onChange={e => handleChange('price', e.target.value)} placeholder="1999" required />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Original Price (₹) <span className="admin-form-label-hint">for strikethrough</span></label>
                <input type="number" className="admin-form-input" value={form.originalPrice}
                  onChange={e => handleChange('originalPrice', e.target.value)} placeholder="2999" />
              </div>
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Description <span className="admin-form-label-hint">optional</span></label>
              <textarea className="admin-form-textarea" value={form.description}
                onChange={e => handleChange('description', e.target.value)}
                placeholder="Describe the product material, design, fit, and highlights..." />
            </div>
          </div>
        </div>

        {/* ── SECTION 2: Category & Placement ── */}
        <div className="admin-form-section">
          <div className="admin-form-section-title">
            <span className="admin-form-section-num">2</span> Category & Placement
          </div>
          <div className="admin-form-section-body">
            <div className="admin-form-row-3">
              <div className="admin-form-group">
                <label className="admin-form-label">Department / Category *</label>
                <select className="admin-form-select" value={form.categoryId}
                  onChange={handleCategoryChange} required>
                  <option value="">Select category...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Target Gender *</label>
                <select
                  className="admin-form-select"
                  value={form.gender}
                  onChange={e => handleGenderChange(e.target.value)}
                  disabled={isGadget}
                  required
                >
                  {isGadget ? (
                    <option value="unisex">Unisex (Gadgets)</option>
                  ) : (
                    <>
                      <option value="men">Men</option>
                      <option value="women">Women</option>
                      <option value="unisex">Unisex / Both</option>
                    </>
                  )}
                </select>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">Subcategory *</label>
                <select className="admin-form-select" value={form.subcategoryId}
                  onChange={handleSubcategoryChange} required disabled={!form.categoryId}>
                  <option value="">
                    {!form.categoryId ? 'Select category first...' : 'Select subcategory...'}
                  </option>
                  {visibleSubcategories.map(s => {
                    const g = getSubcategoryGender(s, activeCategory?.slug);
                    const tag = !isGadget && g !== 'both' ? ` (${g.toUpperCase()})` : '';
                    return (
                      <option key={s.id} value={s.id}>
                        {s.name}{tag}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Atmosphere Theme</label>
              <div className="admin-chip-row">
                {['default', 'clothing', 'footwear', 'accessories', 'gadgets'].map(t => (
                  <button key={t} type="button"
                    className={`admin-chip ${form.atmosphereTheme === t ? 'selected' : ''}`}
                    onClick={() => handleChange('atmosphereTheme', t)}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>


        {/* ── SECTION: Order Quantity & Stock Limits ── */}
        <div className="admin-form-section" style={{
          borderLeft: isGadget ? '4px solid #6366f1' : '1px solid var(--admin-border)',
          background: isGadget ? 'linear-gradient(180deg, rgba(99,102,241,0.03) 0%, rgba(255,255,255,0) 100%)' : 'transparent',
        }}>
          <div className="admin-form-section-title">
            <span className="admin-form-section-num" style={{ background: isGadget ? '#6366f1' : undefined, color: isGadget ? '#fff' : undefined }}>
              ⚡
            </span>
            Gadget Order Quantity &amp; Stock Limits
            {isGadget && <span className="admin-form-section-hint" style={{ color: '#6366f1', fontWeight: 600 }}>— Active for Gadgets</span>}
          </div>
          <div className="admin-form-section-body">
            <p className="admin-hint-text" style={{ marginBottom: '16px' }}>
              Set dynamic ordering rules. Customers will not be allowed to select or place an order below the minimum or above the upper limit / total available stock.
            </p>

            <div className="admin-form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div className="admin-form-group">
                <label className="admin-form-label">
                  Minimum Order Quantity *
                  <span style={{ fontSize: '11px', color: '#6366f1', marginLeft: '6px' }}>
                    (Default starts here)
                  </span>
                </label>
                <input
                  type="number"
                  min="1"
                  className="admin-form-input"
                  value={form.minOrderQuantity || 1}
                  onChange={e => handleChange('minOrderQuantity', Math.max(1, parseInt(e.target.value, 10) || 1))}
                  placeholder="e.g. 3"
                  required
                />
                <span className="admin-field-hint" style={{ fontSize: '11px', color: 'var(--admin-text-muted)', marginTop: '4px' }}>
                  Customer cannot order less than this amount.
                </span>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">
                  Upper Limit / Max Order
                  <span style={{ fontSize: '11px', color: 'var(--admin-text-muted)', marginLeft: '6px' }}>
                    (Optional)
                  </span>
                </label>
                <input
                  type="number"
                  min="1"
                  className="admin-form-input"
                  value={form.maxOrderQuantity || ''}
                  onChange={e => handleChange('maxOrderQuantity', e.target.value ? Math.max(1, parseInt(e.target.value, 10) || 1) : '')}
                  placeholder="e.g. 10 (Leave blank for no max limit)"
                />
                <span className="admin-field-hint" style={{ fontSize: '11px', color: 'var(--admin-text-muted)', marginTop: '4px' }}>
                  Maximum units customer can buy in a single order.
                </span>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">
                  Total Available Quantity / Stock
                  <span style={{ fontSize: '11px', color: 'var(--admin-text-muted)', marginLeft: '6px' }}>
                    (Optional)
                  </span>
                </label>
                <input
                  type="number"
                  min="0"
                  className="admin-form-input"
                  value={form.stockQuantity !== undefined ? form.stockQuantity : ''}
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
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
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
          <div className="admin-form-section-title">
            <span className="admin-form-section-num">3</span> Sizes & Compatibility
            {selectedSubName && <span className="admin-form-section-hint">— {sizePreset.label} for {selectedSubName}</span>}
          </div>
          <div className="admin-form-section-body">
            {!form.subcategoryId && (
              <p className="admin-hint-text">Select category and subcategory above to see smart size suggestions</p>
            )}
            {form.subcategoryId && (
              <div className="admin-chip-grid">
                {sizePreset.sizes.map(s => (
                  <button key={s} type="button"
                    className={`admin-size-chip ${sizes.includes(s) ? 'selected' : ''}`}
                    onClick={() => toggleSize(s)}>
                    {s}
                    {sizes.includes(s) && <span className="admin-chip-check">✓</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="admin-custom-add-row" style={{ marginTop: '14px' }}>
              <input className="admin-form-input" value={customSizeInput}
                onChange={e => setCustomSizeInput(e.target.value)}
                placeholder="Add custom size or model..."
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSize(); } }} />
              <button type="button" className="admin-btn admin-btn-secondary" onClick={addCustomSize}>
                Add Size
              </button>
            </div>
          </div>
        </div>

        {/* ── SECTION 4: Colors ── */}
        <div className="admin-form-section">
          <div className="admin-form-section-title">
            <span className="admin-form-section-num">4</span> Colors
          </div>
          <div className="admin-form-section-body">
            <div className="admin-color-swatches">
              {COMMON_COLORS.map(c => {
                const selected = colors.includes(c.name);
                return (
                  <button key={c.name} type="button"
                    className={`admin-color-swatch ${selected ? 'selected' : ''}`}
                    style={{ '--swatch-color': c.hex }}
                    onClick={() => toggleColor(c.name)}>
                    {selected && <span className="admin-swatch-check">✓</span>}
                    <span className="admin-swatch-label">{c.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="admin-custom-add-row">
              <input className="admin-form-input" value={customColorInput}
                onChange={e => setCustomColorInput(e.target.value)}
                placeholder="Custom color (e.g. Titanium Grey, Rose Gold)..."
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomColor(); } }} />
              <button type="button" className="admin-btn admin-btn-secondary" onClick={addCustomColor}>
                Add Color
              </button>
            </div>
          </div>
        </div>

        {/* ── SECTION 5: Images ── */}
        <div className="admin-form-section">
          <div className="admin-form-section-title">
            <span className="admin-form-section-num">5</span> Product Images
          </div>
          <div className="admin-form-section-body">
            <div className="admin-images-grid">
              <div className="admin-image-slot-group">
                <div className="admin-image-slot-label">Cover Image (Required)</div>
                <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverSelected} />
                {compressing && !coverImage && (
                  <div className="admin-image-compressing">
                    <span className="admin-spinner" />
                    <p>Compressing...</p>
                  </div>
                )}
                {!compressing && !coverImage && (
                  <div className="admin-image-drop-zone admin-image-drop-zone-sm" onClick={() => coverInputRef.current?.click()}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <p>Click to add cover</p>
                  </div>
                )}
                {coverImage && (
                  <div className="admin-image-preview-single">
                    <img src={coverImage.preview} alt="Cover" />
                    <button type="button" className="admin-image-remove-btn" onClick={() => setCoverImage(null)}>✕</button>
                    <span className="admin-image-badge">Cover</span>
                    {coverImage.compressedSize < coverImage.originalSize && (
                      <div className="admin-compress-badge">
                        Saved {Math.round((1 - coverImage.compressedSize / coverImage.originalSize) * 100)}%
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="admin-image-slot-group" style={{ flex: 2 }}>
                <div className="admin-image-slot-label">Gallery / Angle Images</div>
                <input ref={variantInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleVariantsSelected} />
                <div className="admin-variant-images-area">
                  {variantImages.map((v, i) => (
                    <div key={i} className="admin-image-preview-single">
                      <img src={v.preview} alt={`Gallery ${i + 1}`} />
                      <button type="button" className="admin-image-remove-btn"
                        onClick={() => setVariantImages(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
                    </div>
                  ))}
                  <div className="admin-image-drop-zone admin-image-drop-zone-sm" onClick={() => variantInputRef.current?.click()}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="24" height="24">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <p>Add Gallery Photos</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {uploadProgress && (
          <div style={{ padding: '12px 16px', background: 'var(--admin-surface)', border: '1px solid var(--admin-accent)', borderRadius: '8px', color: 'var(--admin-accent-hover)', marginBottom: '16px', fontSize: '13px', fontWeight: 600 }}>
            <span className="admin-spinner" style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            {uploadProgress}
          </div>
        )}

        <button type="submit" className="admin-btn admin-btn-primary admin-btn-submit" disabled={loading}>
          {loading ? (
            <><span className="admin-spinner" style={{ width: 18, height: 18 }} /> Saving Product...</>
          ) : (
            'Publish Product'
          )}
        </button>
      </form>
    </div>
  );
}
