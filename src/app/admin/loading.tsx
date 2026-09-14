import styles from './admin-loading.module.css';

export default function AdminLoading() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className={styles.page}
      aria-busy="true"
      aria-live="polite"
    >
      <span className={styles.srOnly}>Đang tải khu vực quản trị</span>
      <div className={styles.nav} aria-hidden="true" />
      <div className={styles.heading} aria-hidden="true" />
      <div className={styles.metrics} aria-hidden="true">
        <span /><span /><span />
      </div>
      <div className={styles.panel} aria-hidden="true">
        <span /><span /><span /><span />
      </div>
    </main>
  );
}
