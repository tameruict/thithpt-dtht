'use client';

import { FormEvent, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ChevronLeft, ChevronRight, Inbox, Pencil, Plus, Power, RefreshCw, Search, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { showToast } from '@/components/ui/Toast';
import AdminSuiteNav from '../AdminSuiteNav';
import styles from '@/styles/adminPurchase.module.css';

type Product = {
  id: string;
  code: string;
  name: string;
  product_kind: string;
  attempt_count: number;
  price_amount: number;
  currency: string;
  valid_days: number | null;
  is_active: boolean;
  archived_at: string | null;
};

type FormState = {
  code: string;
  name: string;
  product_kind: 'bundle';
  attempt_count: string;
  price_amount: string;
  valid_days: string;
};

const emptyForm: FormState = {
  code: '',
  name: '',
  product_kind: 'bundle',
  attempt_count: '3',
  price_amount: '0',
  valid_days: '',
};

const PAGE_SIZE = 10;

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export default function KeyProductsClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deferredSearch = useDeferredValue(search);

  const loadProducts = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('key_products')
      .select(
        'id,code,name,product_kind,attempt_count,price_amount,currency,valid_days,is_active,archived_at',
      )
      .order('created_at', { ascending: false });
    if (error) {
      setFeedback(error.message);
      showToast(error.message, 'error');
    } else {
      setProducts((data ?? []) as Product[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProducts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadProducts]);

  useEffect(() => {
    if (confirmId) cancelButtonRef.current?.focus();
  }, [confirmId]);

  const closeDeleteDialog = () => {
    if (deleting) return;
    setConfirmId(null);
    window.setTimeout(() => deleteTriggerRef.current?.focus(), 0);
  };

  const stats = useMemo(() => {
    let active = 0;
    let archived = 0;
    for (const product of products) {
      if (product.archived_at) archived += 1;
      else if (product.is_active) active += 1;
    }
    return { total: products.length, active, archived, off: products.length - active - archived };
  }, [products]);

  // UI search/filter phục vụ lọc server-side sau này; hiện giữ query cũ.
  // TODO(server-search): thêm .ilike('code', ...)/.range(cursor) khi catalog lớn.
  const filtered = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return products.filter((product) => {
      if (statusFilter === 'active' && (!product.is_active || product.archived_at)) return false;
      if (statusFilter === 'off' && (product.is_active || product.archived_at)) return false;
      if (statusFilter === 'archived' && !product.archived_at) return false;
      if (term && ![product.code, product.name].some((value) => value.toLowerCase().includes(term))) {
        return false;
      }
      return true;
    });
  }, [products, deferredSearch, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback('');
    const values = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      product_kind: form.product_kind,
      attempt_count: Number(form.attempt_count),
      price_amount: Number(form.price_amount),
      valid_days: form.valid_days ? Number(form.valid_days) : null,
    };
    if (
      !values.code ||
      !values.name ||
      !Number.isInteger(values.attempt_count) ||
      values.attempt_count < 1 ||
      !Number.isInteger(values.price_amount) ||
      values.price_amount < 0 ||
      (values.valid_days !== null &&
        (!Number.isInteger(values.valid_days) || values.valid_days < 1))
    ) {
      setFeedback('Kiểm tra mã, số lượt, giá và hạn dùng.');
      return;
    }

    const supabase = createClient();
    const result = editingId
      ? await supabase
          .from('key_products')
          .update(values)
          .eq('id', editingId)
      : await supabase.from('key_products').insert(values);
    if (result.error) {
      setFeedback(result.error.message);
      showToast(result.error.message, 'error');
      return;
    }
    setForm(emptyForm);
    setEditingId(null);
    showToast(editingId ? 'Đã lưu gói.' : 'Đã tạo gói mới.', 'success');
    await loadProducts();
  };

  const edit = (product: Product) => {
    setEditingId(product.id);
    setForm({
      code: product.code,
      name: product.name,
      product_kind: 'bundle',
      attempt_count: String(product.attempt_count),
      price_amount: String(product.price_amount),
      valid_days: product.valid_days === null ? '' : String(product.valid_days),
    });
  };

  const archive = async (product: Product) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('key_products')
      .update({ archived_at: new Date().toISOString(), is_active: false })
      .eq('id', product.id);
    if (error) {
      setFeedback(error.message);
      showToast(error.message, 'error');
    } else {
      showToast(`Đã archive gói ${product.code}.`, 'success');
    }
    await loadProducts();
  };

  const toggle = async (product: Product) => {
    if (product.archived_at) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('key_products')
      .update({ is_active: !product.is_active })
      .eq('id', product.id);
    if (error) {
      setFeedback(error.message);
      showToast(error.message, 'error');
    } else {
      showToast(`Đã ${product.is_active ? 'tắt' : 'bật'} gói ${product.code}.`, 'success');
    }
    await loadProducts();
  };

  const remove = async (product: Product) => {
    setDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('key_products')
        .delete()
        .eq('id', product.id);
      if (error) {
        setFeedback(error.message);
        showToast(error.message, 'error');
      } else {
        showToast(`Đã xóa gói ${product.code}.`, 'success');
      }
      setConfirmId(null);
      await loadProducts();
    } finally {
      setDeleting(false);
      window.setTimeout(() => deleteTriggerRef.current?.focus(), 0);
    }
  };

  const handleExport = () => {
    if (filtered.length === 0) return;
    const header = ['Mã gói', 'Tên', 'Số lượt', 'Giá VND', 'Hạn dùng (ngày)', 'Trạng thái'];
    const lines = filtered.map((product) =>
      [
        csvCell(product.code),
        csvCell(product.name),
        csvCell(product.attempt_count),
        csvCell(product.price_amount),
        csvCell(product.valid_days ?? ''),
        csvCell(product.archived_at ? 'Archived' : product.is_active ? 'Active' : 'Tắt'),
      ].join(','),
    );
    const blob = new Blob([`﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'goi-key.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast(`Đã xuất ${filtered.length} gói ra CSV.`, 'success');
  };

  const confirmProduct = products.find((product) => product.id === confirmId) ?? null;

  return (
    <main className={styles.page} id="main">
      <div className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>ADMIN · CHECKOUT</p>
          <h1>Gói key</h1>
          <p>Cấu hình catalog, bật/tắt hoặc archive sản phẩm.</p>
        </div>
      </div>

      <AdminSuiteNav active="products" />

      <div className={styles.kpiGrid} aria-label="Thống kê gói key">
        <div className={styles.kpi}>
          <span>Tổng gói</span>
          <strong>{stats.total}</strong>
        </div>
        <div className={styles.kpi}>
          <span>Đang bán</span>
          <strong>{stats.active}</strong>
        </div>
        <div className={styles.kpi}>
          <span>Đã archive</span>
          <strong>{stats.archived}</strong>
        </div>
      </div>

      <div className={styles.adminGrid}>
        <section className={styles.card} aria-label="Tạo hoặc sửa gói">
          <h2>{editingId ? 'Sửa gói' : 'Tạo gói mới'}</h2>
          <form className={styles.form} onSubmit={submit}>
            <label>
              Mã gói
              <input
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
                placeholder="BUNDLE-10"
                disabled={Boolean(editingId)}
              />
            </label>
            <label>
              Tên hiển thị
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Gói 10 lượt"
              />
            </label>
            <label>
              Phạm vi sử dụng
              <input
                value="Tất cả phòng thi và tự luyện"
                readOnly
                aria-readonly="true"
              />
            </label>
            <label>
              Số lượt
              <input
                type="number"
                min="1"
                value={form.attempt_count}
                onChange={(event) =>
                  setForm({ ...form, attempt_count: event.target.value })
                }
              />
            </label>
            <label>
              Giá VND
              <input
                type="number"
                min="0"
                value={form.price_amount}
                onChange={(event) =>
                  setForm({ ...form, price_amount: event.target.value })
                }
              />
            </label>
            <label>
              Hạn dùng (ngày)
              <input
                type="number"
                min="1"
                value={form.valid_days}
                onChange={(event) =>
                  setForm({ ...form, valid_days: event.target.value })
                }
                placeholder="Để trống = không hạn"
              />
            </label>
            <div className={styles.actions}>
              <button className="btn" type="submit">
                {editingId ? <Pencil size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                {editingId ? 'Lưu gói' : 'Tạo gói'}
              </button>
              {editingId ? (
                <button
                  className="btn outline"
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm);
                  }}
                >
                  Hủy
                </button>
              ) : null}
            </div>
          </form>
          {feedback ? <p className={styles.error} role="status" aria-live="polite">{feedback}</p> : null}
        </section>

        <section className={styles.card} aria-label="Catalog gói key">
          <div className={styles.sectionHeader}>
            <h2>Catalog ({filtered.length}/{products.length})</h2>
            <div className={styles.toolbar}>
              <select value={statusFilter} onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }} aria-label="Lọc gói theo trạng thái">
                <option value="">Tất cả</option>
                <option value="active">Đang bán</option>
                <option value="off">Đang tắt</option>
                <option value="archived">Archived</option>
              </select>
              <button
                className="btn secondary small"
                type="button"
                onClick={handleExport}
                disabled={filtered.length === 0}
              >
                Xuất CSV
              </button>
              <button
                className={styles.iconButton}
                type="button"
                onClick={() => void loadProducts()}
                aria-label="Tải lại catalog"
              >
                <RefreshCw size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className={`${styles.toolbar} ${styles.eventListSpaced}`}>
            <label className={styles.searchField}>
              Tìm gói
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Mã hoặc tên gói..."
                aria-label="Tìm gói key"
              />
            </label>
          </div>
          {loading ? (
            <div className={styles.skeleton} role="status" aria-label="Đang tải catalog">
              <span /><span /><span />
            </div>
          ) : null}
          <div className={styles.productList}>
            {paged.map((product) => (
              <article className={styles.productRow} key={product.id}>
                <div>
                  <strong>{product.name}</strong>
                  <span>
                    {product.code} · {product.attempt_count} lượt ·{' '}
                    {product.price_amount.toLocaleString('vi-VN')} ₫
                  </span>
                  <small>Dùng chung cho thi chính thức và tự luyện</small>
                </div>
                <span className={product.is_active && !product.archived_at ? styles.active : styles.inactive}>
                  {product.archived_at ? 'Archived' : product.is_active ? 'Active' : 'Tắt'}
                </span>
                <div className={styles.rowActions}>
                  <button type="button" onClick={() => edit(product)} aria-label={`Sửa gói ${product.code}`}>
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggle(product)}
                    disabled={Boolean(product.archived_at)}
                    aria-label={product.is_active ? `Tắt gói ${product.code}` : `Bật gói ${product.code}`}
                  >
                    <Power size={15} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => void archive(product)} aria-label={`Archive gói ${product.code}`}>
                    <Archive size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      deleteTriggerRef.current = event.currentTarget;
                      setConfirmId(product.id);
                    }}
                    aria-label={`Xóa gói ${product.code}`}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
            {!loading && paged.length === 0 ? (
              <div className={styles.empty}>
                <Search className={styles.iconGlyph} size={20} aria-hidden="true" />
                {products.length === 0 ? 'Chưa có gói nào. Tạo gói đầu tiên ở form bên cạnh.' : 'Không có gói nào khớp bộ lọc.'}
              </div>
            ) : null}
          </div>
          {filtered.length > 0 ? (
            <div className={styles.pagination}>
              <span>Trang {safePage}/{pageCount} · {filtered.length} gói</span>
              <div>
                <button type="button" onClick={() => setPage(safePage - 1)} disabled={safePage <= 1} aria-label="Trang trước">
                  <ChevronLeft size={15} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount} aria-label="Trang sau">
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {confirmProduct ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-product-title"
          aria-describedby="delete-product-desc"
          className={styles.dialogOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDeleteDialog();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              closeDeleteDialog();
              return;
            }
            if (event.key !== 'Tab') return;
            const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'));
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (!first || !last) return;
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <div className={`${styles.card} ${styles.dialog}`}>
            <h2 id="delete-product-title">Xóa gói {confirmProduct.code}?</h2>
            <p id="delete-product-desc" className={styles.hint}>
              Hành động này xóa vĩnh viễn khỏi catalog. Đơn đã bán không bị ảnh hưởng.
            </p>
            <div className={styles.dialogActions}>
              <button ref={cancelButtonRef} className="btn secondary small" type="button" onClick={closeDeleteDialog} disabled={deleting}>
                Hủy
              </button>
              <button
                className={`btn small ${styles.dangerButton}`}
                type="button"
                onClick={() => void remove(confirmProduct)}
                disabled={deleting}
              >
                <Trash2 size={15} aria-hidden="true" /> {deleting ? 'Đang xóa...' : 'Xóa gói'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {products.length === 0 && !loading ? (
        <p className={`${styles.hint} ${styles.tip}`}>
          <Inbox size={15} aria-hidden="true" /> Mẹo: tạo 2–3 gói phổ biến (ít lượt / nhiều lượt) để học viên dễ chọn.
        </p>
      ) : null}
    </main>
  );
}
