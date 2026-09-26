'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

// ── Custom Delete Confirmation Modal ────────────────────────────────────────
function DeleteModal({ product, onConfirm, onCancel, isDeleting }) {
  if (!product) return null;
  return (
    <div className="admin-modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="admin-modal">
        <div className="admin-modal-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </div>
        <div className="admin-modal-title">Permanently Delete Product?</div>
        <div className="admin-modal-body">
          <p>You are about to permanently delete:</p>
          <div className="admin-modal-product-name">&ldquo;{product.name}&rdquo;</div>
          <div className="admin-modal-warning">
            ⚠️ This will <strong>permanently remove</strong> the product, all its images from storage, and all associated data from the database. <strong>This cannot be undone.</strong>
          </div>
        </div>
        <div className="admin-modal-actions">
          <button className="admin-btn admin-btn-ghost" onClick={onCancel} disabled={isDeleting}>
            Cancel — Keep it
          </button>
          <button
            className="admin-btn admin-btn-danger-solid"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <><span className="admin-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Deleting...</>
            ) : (
              <>🗑 Yes, Delete Permanently</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const categoryIdFilter = searchParams.get('categoryId') || '';
  const categoryNameFilter = searchParams.get('categoryName') || '';

  const [products, setProducts] = useState([]);
  const [gadgetQuantities, setGadgetQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toggling, setToggling] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch(`/api/products?_t=${Date.now()}`, { cache: 'no-store' });
      let prods = [];
      let gMap = {};

      if (res.ok) {
        const json = await res.json();
        prods = json.products || [];
        gMap = json.gadgetQuantities || {};
      }

      // Guarantee freshest limits directly from public storage CDN
      try {
        const sUrl = `https://skimedlufkytgemmdhsv.supabase.co/storage/v1/object/public/store-config/gadget_quantities.json?t=${Date.now()}`;
        const sRes = await fetch(sUrl, { cache: 'no-store' });
        if (sRes.ok) {
          const freshMap = await sRes.json();
          gMap = { ...gMap, ...freshMap };
        }
      } catch (e) {}

      const enriched = prods.map(p => {
        const limit = gMap[p.id] || gMap[p.id?.toLowerCase()] || {};
        return {
          ...p,
          min_order_quantity: limit.minOrderQuantity !== undefined ? limit.minOrderQuantity : (p.min_order_quantity || 1),
          max_order_quantity: limit.maxOrderQuantity !== undefined ? limit.maxOrderQuantity : (p.max_order_quantity || null),
          stock_quantity: limit.stockQuantity !== undefined ? limit.stockQuantity : (p.stock_quantity || null),
        };
      });

      setProducts(enriched);
      setGadgetQuantities(gMap);
    } catch (err) {
      console.error('Error fetching products:', err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const categoryFiltered = categoryIdFilter
    ? products.filter(p => p.subcategories?.categories?.id === categoryIdFilter)
    : products;

  const filtered = categoryFiltered.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.brand?.toLowerCase().includes(search.toLowerCase()) ||
    p.subcategories?.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.subcategories?.categories?.name?.toLowerCase().includes(search.toLowerCase())
  );

  // Toggle active — hides/shows on website but KEEPS all data in DB
  const handleToggleActive = async (id, currentStatus) => {
    setToggling(id);
    try {
      const res = await fetch('/api/toggle-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id, isActive: currentStatus }),
      });
      if (res.ok) {
        setProducts(prev =>
          prev.map(p => p.id === id ? { ...p, is_active: !currentStatus } : p)
        );
      } else {
        const j = await res.json();
        alert('Toggle error: ' + j.error);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setToggling(null);
    }
  };

  // Confirm delete → show modal
  const handleDeleteClick = (product) => setDeleteTarget(product);

  // Execute permanent delete
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/delete-product', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: deleteTarget.id }),
      });
      if (res.ok) {
        setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        const j = await res.json();
        alert('Delete error: ' + j.error);
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return <div className="admin-loading"><span className="admin-spinner" /> Loading products...</div>;
  }

  return (
    <>
      {/* Delete Confirmation Modal */}
      <DeleteModal
        product={deleteTarget}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        isDeleting={isDeleting}
      />

      <div className="admin-table-wrapper">
        <div className="admin-table-header">
          <div>
            <h3>
              {categoryNameFilter || 'All Products'}
              <span style={{ fontWeight: 400, color: 'var(--admin-text-muted)', marginLeft: 8, fontSize: 13 }}>
                ({filtered.length})
              </span>
            </h3>
            {categoryNameFilter && (
              <button
                className="admin-btn admin-btn-ghost"
                style={{ fontSize: 12, padding: '3px 10px', marginTop: 4 }}
                onClick={() => router.push('/products')}
              >
                ← All Categories
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', maxWidth: '420px', width: '100%' }}>
            <div className="admin-search" style={{ flex: '1 1 auto', minWidth: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input type="text" placeholder="Search products..." value={search}
                onChange={e => setSearch(e.target.value)} id="product-search" style={{ width: '100%' }} />
            </div>
            <Link href="/products/new" className="admin-btn admin-btn-primary" id="add-product-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add
            </Link>
          </div>
        </div>

        {/* Toggle legend */}
        <div className="admin-toggle-legend">
          <span>
            <span className="admin-toggle-dot active" /> Active = visible on website
          </span>
          <span>
            <span className="admin-toggle-dot" /> Inactive = hidden from website, data kept in database
          </span>
        </div>

        {/* Desktop table */}
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Image</th><th>Name</th><th>Code</th><th>Category</th>
                <th>Price</th><th>Badge</th><th>Order Limits</th>
                <th title="Toggle to show/hide on website. Data always stays in database.">Visibility</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const thumb = p.product_images?.sort((a, b) => a.display_order - b.display_order)?.[0];
                const isToggling = toggling === p.id;
                return (
                  <tr key={p.id}>
                    <td>
                      {thumb
                        ? <img src={thumb.image_url} alt={p.name} className="admin-table-thumb" />
                        : <div className="admin-table-thumb" style={{ background: 'var(--admin-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'var(--admin-text-muted)' }}>No img</div>
                      }
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--admin-text-muted)' }}>{p.brand}</div>
                    </td>
                    <td>
                      {p.product_code
                        ? <span style={{ fontFamily: 'monospace', fontSize: '11px', background: 'var(--admin-border)', padding: '2px 7px', borderRadius: '4px', color: 'var(--admin-text-muted)', letterSpacing: '0.05em' }}>{p.product_code}</span>
                        : <span style={{ color: 'var(--admin-text-muted)' }}>—</span>}
                    </td>
                    <td style={{ color: 'var(--admin-text-muted)', fontSize: '12px' }}>
                      {p.subcategories?.categories?.name} › {p.subcategories?.name}
                    </td>
                    <td>&#8377;{p.price?.toLocaleString()}</td>
                    <td>
                      {p.badge
                        ? <span className="admin-badge admin-badge-blue">{p.badge}</span>
                        : <span style={{ color: 'var(--admin-text-muted)' }}>—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          className={`admin-toggle ${p.is_active ? 'active' : ''}`}
                          onClick={() => !isToggling && handleToggleActive(p.id, p.is_active)}
                          disabled={isToggling}
                          title={p.is_active
                            ? 'Visible on website — click to hide (data stays in DB)'
                            : 'Hidden from website — click to show'}
                        />
                        <span style={{ fontSize: 11, color: p.is_active ? 'var(--admin-success)' : 'var(--admin-text-muted)' }}>
                          {isToggling ? '...' : p.is_active ? 'Live' : 'Hidden'}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <Link href={`/products/${p.id}/edit`} className="admin-btn admin-btn-sm admin-btn-secondary">Edit</Link>
                        <button
                          className="admin-btn admin-btn-sm admin-btn-danger"
                          onClick={() => handleDeleteClick(p)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--admin-text-muted)' }}>
                    {search ? 'No products match your search.' : categoryNameFilter ? `No products in ${categoryNameFilter}.` : 'No products yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card view */}
        <div className="admin-mobile-cards">
          {filtered.map(p => {
            const thumb = p.product_images?.sort((a, b) => a.display_order - b.display_order)?.[0];
            const isToggling = toggling === p.id;
            return (
              <div key={p.id} className="admin-mobile-card">
                {thumb
                  ? <img src={thumb.image_url} alt={p.name} className="admin-mobile-card-thumb" />
                  : <div className="admin-mobile-card-thumb-placeholder">No img</div>
                }
                <div className="admin-mobile-card-body">
                  <div className="admin-mobile-card-title">{p.name}</div>
                  <div className="admin-mobile-card-subtitle">
                    {p.product_code && <span style={{ fontFamily: 'monospace', fontSize: '10px', background: 'var(--admin-border)', padding: '1px 5px', borderRadius: '3px', marginRight: '5px' }}>{p.product_code}</span>}
                    {p.brand} · {p.subcategories?.categories?.name} › {p.subcategories?.name}
                  </div>
                  <div className="admin-mobile-card-meta">
                    <span className="admin-mobile-card-price">₹{p.price?.toLocaleString()}</span>
                    {p.badge && <span className="admin-badge admin-badge-blue">{p.badge}</span>}
                    <span className={`admin-badge ${p.is_active ? 'admin-badge-green' : 'admin-badge-red'}`}>
                      {p.is_active ? 'Live' : 'Hidden'}
                    </span>
                  </div>
                  <div className="admin-mobile-card-actions">
                    <button
                      className={`admin-toggle ${p.is_active ? 'active' : ''}`}
                      onClick={() => !isToggling && handleToggleActive(p.id, p.is_active)}
                      disabled={isToggling}
                      title={p.is_active ? 'Click to hide from website' : 'Click to show on website'}
                    />
                    <Link href={`/products/${p.id}/edit`} className="admin-btn admin-btn-sm admin-btn-secondary">Edit</Link>
                    <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleDeleteClick(p)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--admin-text-muted)', fontSize: '13px' }}>
              {search ? 'No products match your search.' : 'No products yet.'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function AdminProductsPage() {
  return (
    <Suspense fallback={<div className="admin-loading"><span className="admin-spinner" /> Loading...</div>}>
      <ProductsPageInner />
    </Suspense>
  );
}
