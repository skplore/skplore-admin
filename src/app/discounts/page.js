'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const DISCOUNT_PRESETS = [0, 5, 10, 15, 20, 25, 30, 40, 50];

const CATEGORY_ICONS = {
  clothing: '🎽',
  footwear: '👟',
  accessories: '🕶️',
  gadgets: '📱',
};

const CATEGORY_DESCS = {
  clothing: 'Applies automatically to all men and women clothing products in cart.',
  footwear: 'Applies automatically to all men and women footwear in cart.',
  accessories: 'Applies automatically to all bags, watches, sunglasses, and belts in cart.',
  gadgets: 'Applies automatically to all phone cases, audio, chargers, and gadgets in cart.',
};

export default function AdminDiscountsPage() {
  const supabase = createClient();
  const [categories, setCategories] = useState([]);
  const [discounts, setDiscounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        // Load categories from Supabase
        const { data: cats } = await supabase.from('categories').select('*').order('name');
        setCategories(cats || []);

        // Load current discounts from API
        const res = await fetch('/api/discounts');
        if (res.ok) {
          const json = await res.json();
          setDiscounts(json.discounts || {});
        }
      } catch (err) {
        setErrorMsg('Failed to load discount settings: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handlePresetSelect = (categorySlug, percent) => {
    setDiscounts(prev => ({
      ...prev,
      [categorySlug]: percent,
    }));
  };

  const handleCustomChange = (categorySlug, value) => {
    const val = value === '' ? 0 : Math.max(0, Math.min(100, Number(value) || 0));
    setDiscounts(prev => ({
      ...prev,
      [categorySlug]: val,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg('');
    setToast('');
    try {
      const res = await fetch('/api/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discounts }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save discounts');

      setToast('Discounts successfully updated! Cart discounts and homepage promo ribbon are now live.');
      setTimeout(() => setToast(''), 5000);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-loading">
        <span className="admin-spinner" /> Loading discount settings...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '960px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 6px' }}>Dynamic Category Discounts</h2>
          <p style={{ color: 'var(--admin-text-muted)', fontSize: '13px', margin: 0 }}>
            Configure automatic checkout discounts per category. Active discounts dynamically update customer carts and the homepage promo ribbon.
          </p>
        </div>
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '10px 24px', fontSize: '14px', fontWeight: 700 }}
        >
          {saving ? (
            <><span className="admin-spinner" style={{ width: 16, height: 16 }} /> Saving...</>
          ) : (
            'Save All Discounts'
          )}
        </button>
      </div>

      {toast && (
        <div style={{
          padding: '14px 18px',
          background: 'rgba(34, 197, 94, 0.12)',
          border: '1px solid var(--admin-success)',
          borderRadius: '10px',
          color: '#4ade80',
          marginBottom: '24px',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <span>✓</span>
          <span>{toast}</span>
        </div>
      )}

      {errorMsg && (
        <div style={{
          padding: '14px 18px',
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid var(--admin-danger)',
          borderRadius: '10px',
          color: '#f87171',
          marginBottom: '24px',
          fontSize: '14px',
        }}>
          {errorMsg}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {categories.map((cat) => {
          const currentPct = discounts[cat.slug] ?? 0;
          const hasDiscount = currentPct > 0;
          const icon = CATEGORY_ICONS[cat.slug] || '🏷️';
          const desc = CATEGORY_DESCS[cat.slug] || `Applies to all ${cat.name} products.`;

          return (
            <div
              key={cat.id}
              style={{
                background: 'var(--admin-surface)',
                border: hasDiscount ? '1px solid rgba(124, 58, 237, 0.4)' : '1px solid var(--admin-border)',
                borderRadius: '14px',
                padding: '24px',
                boxShadow: hasDiscount ? '0 4px 20px rgba(124, 58, 237, 0.08)' : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '28px', lineHeight: 1 }}>{icon}</span>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {cat.name}
                      <span style={{ fontSize: '12px', color: 'var(--admin-text-muted)', fontWeight: 400 }}>
                        ({cat.slug})
                      </span>
                    </h3>
                    <p style={{ color: 'var(--admin-text-muted)', fontSize: '12px', margin: 0 }}>
                      {desc}
                    </p>
                  </div>
                </div>

                {/* Badge showing current status */}
                <div>
                  {hasDiscount ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      borderRadius: '20px',
                      background: 'rgba(124, 58, 237, 0.2)',
                      color: 'var(--admin-accent-hover)',
                      fontSize: '13px',
                      fontWeight: 700,
                      border: '1px solid rgba(124, 58, 237, 0.35)',
                    }}>
                      ⚡ {currentPct}% AUTO DISCOUNT ACTIVE
                    </span>
                  ) : (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '6px 14px',
                      borderRadius: '20px',
                      background: 'var(--admin-bg)',
                      color: 'var(--admin-text-muted)',
                      fontSize: '12px',
                      fontWeight: 600,
                      border: '1px solid var(--admin-border)',
                    }}>
                      No Discount (Standard Price)
                    </span>
                  )}
                </div>
              </div>

              {/* Discount selection preset buttons */}
              <div style={{ marginTop: '16px' }}>
                <label style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--admin-text-muted)', fontWeight: 600, display: 'block', marginBottom: '10px' }}>
                  Select Discount Percentage:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  {DISCOUNT_PRESETS.map((pct) => {
                    const isSelected = currentPct === pct;
                    const isNone = pct === 0;

                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handlePresetSelect(cat.slug, pct)}
                        style={{
                          padding: isNone ? '8px 16px' : '8px 14px',
                          borderRadius: '8px',
                          border: isSelected
                            ? '1px solid var(--admin-accent)'
                            : '1px solid var(--admin-border)',
                          background: isSelected
                            ? 'var(--admin-accent)'
                            : 'var(--admin-bg)',
                          color: isSelected ? '#fff' : isNone ? 'var(--admin-text-muted)' : 'var(--admin-text)',
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: '13px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isNone ? 'None (0%)' : `${pct}% OFF`}
                      </button>
                    );
                  })}

                  {/* Custom percentage input */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--admin-text-muted)' }}>Custom:</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={currentPct}
                      onChange={(e) => handleCustomChange(cat.slug, e.target.value)}
                      style={{
                        width: '64px',
                        padding: '7px 8px',
                        borderRadius: '8px',
                        background: 'var(--admin-bg)',
                        border: '1px solid var(--admin-border)',
                        color: 'var(--admin-text)',
                        fontSize: '13px',
                        textAlign: 'center',
                        fontWeight: 600,
                      }}
                    />
                    <span style={{ fontSize: '13px', color: 'var(--admin-text-muted)' }}>%</span>
                  </div>
                </div>
              </div>

              {/* Real-time Math Preview */}
              <div style={{
                marginTop: '16px',
                padding: '10px 14px',
                background: 'var(--admin-bg)',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'var(--admin-text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span>
                  <strong>Cart preview:</strong>{' '}
                  {hasDiscount ? (
                    <>
                      A ₹2,000 item will be discounted to{' '}
                      <strong style={{ color: 'var(--admin-text)' }}>
                        ₹{Math.round(2000 * (1 - currentPct / 100)).toLocaleString('en-IN')}
                      </strong>{' '}
                      (Customer saves ₹{Math.round(2000 * (currentPct / 100)).toLocaleString('en-IN')})
                    </>
                  ) : (
                    'Customer pays standard price with no automatic category discount.'
                  )}
                </span>
                <span style={{ fontStyle: 'italic', fontSize: '11px' }}>
                  {hasDiscount ? 'Included in promo ribbon' : 'Excluded from promo ribbon'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '28px', textAlign: 'right' }}>
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '12px 32px', fontSize: '15px', fontWeight: 700 }}
        >
          {saving ? 'Saving...' : 'Save All Discounts'}
        </button>
      </div>
    </div>
  );
}
