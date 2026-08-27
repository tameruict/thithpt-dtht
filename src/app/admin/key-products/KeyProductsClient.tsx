'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Archive, Pencil, Plus, Power, RefreshCw, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
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

export default function KeyProductsClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);

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
    } else {
      setProducts((data ?? []) as Product[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProducts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadProducts]);

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
      return;
    }
    setForm(emptyForm);
    setEditingId(null);
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
    if (error) setFeedback(error.message);
    await loadProducts();
  };

  const toggle = async (product: Product) => {
    if (product.archived_at) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('key_products')
      .update({ is_active: !product.is_active })
      .eq('id', product.id);
    if (error) setFeedback(error.message);
    await loadProducts();
  };

  const remove = async (product: Product) => {
    if (!window.confirm('Xóa gói ' + product.code + '?')) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('key_products')
      .delete()
      .eq('id', product.id);
    if (error) setFeedback(error.message);
    await loadProducts();
  };

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>ADMIN · CHECKOUT</p>
          <h1>Gói key</h1>
          <p>Cấu hình catalog, bật/tắt hoặc archive sản phẩm.</p>
        </div>
        <div className={styles.links}>
          <Link href="/admin/purchases">Đơn ThueAPIBank</Link>
          <Link href="/admin">Dashboard</Link>
        </div>
      </div>

      <div className={styles.adminGrid}>
        <section className={styles.card}>
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
                {editingId ? <Pencil size={16} /> : <Plus size={16} />}
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
          {feedback ? <p className={styles.error}>{feedback}</p> : null}
        </section>

        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <h2>Catalog</h2>
            <button
              className={styles.iconButton}
              type="button"
              onClick={() => void loadProducts()}
              aria-label="Tải lại catalog"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {loading ? <p>Đang tải...</p> : null}
          <div className={styles.productList}>
            {products.map((product) => (
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
                  <button type="button" onClick={() => edit(product)} aria-label="Sửa gói">
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggle(product)}
                    disabled={Boolean(product.archived_at)}
                    aria-label={product.is_active ? 'Tắt gói' : 'Bật gói'}
                  >
                    <Power size={15} />
                  </button>
                  <button type="button" onClick={() => void archive(product)} aria-label="Archive gói">
                    <Archive size={15} />
                  </button>
                  <button type="button" onClick={() => void remove(product)} aria-label="Xóa gói">
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
            {!loading && products.length === 0 ? <p>Chưa có gói nào.</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
