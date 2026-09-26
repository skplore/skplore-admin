'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// Default smart gender determination if column is not explicitly set in DB
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

export default function AdminCategoriesPage() {
  const supabase = createClient();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCatName, setNewCatName] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [newSubGender, setNewSubGender] = useState('both');
  const [addingSubFor, setAddingSubFor] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('categories')
      .select('*, subcategories(*)')
      .order('name');
    setCategories(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const slugify = (str) =>
    str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setActionLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCatName.trim(),
          slug: slugify(newCatName.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create category');
      setNewCatName('');
      await fetchCategories();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCategory = async (id, name) => {
    if (!confirm(`Delete category "${name}" and all its subcategories?`)) return;
    setActionLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete category');
      await fetchCategories();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddSubcategory = async (e, categoryId) => {
    e.preventDefault();
    if (!newSubName.trim()) return;
    setActionLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/subcategories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: categoryId,
          name: newSubName.trim(),
          slug: slugify(newSubName.trim()),
          gender: newSubGender,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create subcategory');
      setNewSubName('');
      setNewSubGender('both');
      setAddingSubFor(null);
      await fetchCategories();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSubcategory = async (id, name) => {
    if (!confirm(`Delete subcategory "${name}"?`)) return;
    setActionLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/subcategories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete subcategory');
      await fetchCategories();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const toggleExpand = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <span className="admin-spinner" /> Loading categories...
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 6px' }}>Categories & Subcategories</h2>
        <p style={{ color: 'var(--admin-text-muted)', fontSize: '13px', margin: 0 }}>
          Manage catalog structure, departments, and gender assignments for accurate storefront placement.
        </p>
      </div>

      {errorMsg && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid var(--admin-danger)',
          borderRadius: '8px',
          color: '#f87171',
          marginBottom: '20px',
          fontSize: '13px',
        }}>
          {errorMsg}
        </div>
      )}

      {/* Add Category Form */}
      <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <input
          type="text"
          className="admin-form-input"
          placeholder="New department / category name..."
          value={newCatName}
          onChange={(e) => setNewCatName(e.target.value)}
          style={{ flex: '1 1 240px', minWidth: '0' }}
          id="new-category-input"
          disabled={actionLoading}
        />
        <button type="submit" className="admin-btn admin-btn-primary" id="add-category-btn" disabled={actionLoading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Category
        </button>
      </form>

      {/* Category List Cards */}
      {categories.map((cat) => {
        const isGadget = cat.slug === 'gadgets';

        return (
          <div key={cat.id} className="admin-category-card" style={{ marginBottom: '16px' }}>
            <div
              className="admin-category-card-header"
              onClick={() => toggleExpand(cat.id)}
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  width="18"
                  height="18"
                  style={{
                    transform: expanded[cat.id] ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span>{cat.name}</span>
                <span style={{ color: 'var(--admin-text-muted)', fontWeight: 400, fontSize: '12px' }}>
                  ({cat.subcategories?.length || 0} subcategories)
                </span>
              </h4>
              <div style={{ display: 'flex', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="admin-btn admin-btn-sm admin-btn-secondary"
                  onClick={() => {
                    setAddingSubFor(addingSubFor === cat.id ? null : cat.id);
                    setNewSubName('');
                    setNewSubGender(isGadget ? 'unisex' : 'both');
                  }}
                  disabled={actionLoading}
                >
                  + Add Subcategory
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-sm admin-btn-danger"
                  onClick={() => handleDeleteCategory(cat.id, cat.name)}
                  disabled={actionLoading}
                >
                  Delete
                </button>
              </div>
            </div>

            {expanded[cat.id] && (
              <div className="admin-category-card-content" style={{ padding: '16px', borderTop: '1px solid var(--admin-border)' }}>
                {addingSubFor === cat.id && (
                  <form
                    onSubmit={(e) => handleAddSubcategory(e, cat.id)}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      marginBottom: '16px',
                      padding: '14px',
                      background: 'var(--admin-surface-hover)',
                      borderRadius: '8px',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="text"
                      className="admin-form-input"
                      placeholder="Subcategory name (e.g. High Heels, Lehengas)..."
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      autoFocus
                      style={{ flex: '1 1 200px' }}
                      disabled={actionLoading}
                    />

                    {!isGadget && (
                      <select
                        className="admin-form-select"
                        value={newSubGender}
                        onChange={(e) => setNewSubGender(e.target.value)}
                        style={{ width: '160px' }}
                        disabled={actionLoading}
                      >
                        <option value="both">Both (Men & Women)</option>
                        <option value="women">Women Only</option>
                        <option value="men">Men Only</option>
                        <option value="unisex">Unisex</option>
                      </select>
                    )}

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="submit" className="admin-btn admin-btn-sm admin-btn-primary" disabled={actionLoading}>
                        {actionLoading ? 'Saving...' : 'Add'}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm admin-btn-secondary"
                        onClick={() => setAddingSubFor(null)}
                        disabled={actionLoading}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {cat.subcategories?.length === 0 ? (
                  <p style={{ color: 'var(--admin-text-muted)', padding: '8px 0', fontSize: '13px', margin: 0 }}>
                    No subcategories yet.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {cat.subcategories?.map((sub) => {
                      const gender = getSubcategoryGender(sub, cat.slug);
                      const badgeBg =
                        gender === 'women'
                          ? 'rgba(236, 72, 153, 0.15)'
                          : gender === 'men'
                          ? 'rgba(59, 130, 246, 0.15)'
                          : 'rgba(124, 58, 237, 0.15)';
                      const badgeColor =
                        gender === 'women' ? '#f472b6' : gender === 'men' ? '#60a5fa' : '#a78bfa';

                      return (
                        <div
                          key={sub.id}
                          className="admin-subcategory-item"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 14px',
                            background: 'var(--admin-bg)',
                            borderRadius: '6px',
                            border: '1px solid var(--admin-border)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontWeight: 600 }}>{sub.name}</span>
                            <span style={{ color: 'var(--admin-text-muted)', fontSize: '12px' }}>
                              /{sub.slug}
                            </span>
                            {!isGadget && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  background: badgeBg,
                                  color: badgeColor,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {gender === 'women' ? 'Women' : gender === 'men' ? 'Men' : 'Both (Men & Women)'}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-danger"
                            onClick={() => handleDeleteSubcategory(sub.id, sub.name)}
                            disabled={actionLoading}
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                          >
                            Delete
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {categories.length === 0 && (
        <div className="admin-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <p>No categories yet. Create your first category above.</p>
        </div>
      )}
    </>
  );
}
