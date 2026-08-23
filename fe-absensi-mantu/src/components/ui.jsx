import { AlertTriangle, Inbox, LoaderCircle, Search, X } from 'lucide-react'

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Cari data...' }) {
  return (
    <label className="search-box">
      <Search size={18} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  )
}

export function Field({ label, required, hint, children }) {
  return (
    <label className="field">
      <span>{label}{required && <b> *</b>}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function Modal({ open, title, description, children, onClose, size = 'md' }) {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Tutup"><X size={20} /></button>
        </div>
        {children}
      </section>
    </div>
  )
}

export function ConfirmDialog({ open, title = 'Hapus data?', description, busy, onClose, onConfirm }) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="confirm-content"><span className="warning-icon"><AlertTriangle /></span><p>{description}</p></div>
      <div className="modal-footer">
        <button className="button secondary" type="button" onClick={onClose}>Batal</button>
        <button className="button danger" type="button" disabled={busy} onClick={onConfirm}>{busy ? 'Menghapus...' : 'Ya, hapus'}</button>
      </div>
    </Modal>
  )
}

export function DataTable({ columns, rows, loading, emptyTitle = 'Belum ada data', emptyText = 'Tambahkan data untuk memulai.' }) {
  if (loading) return <Loading />
  if (!rows.length) return <EmptyState title={emptyTitle} text={emptyText} />
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>{columns.map((column) => <td key={column.key} data-label={column.label}>{column.render ? column.render(row) : row[column.key]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Loading({ label = 'Memuat data...' }) {
  return <div className="loading"><LoaderCircle className="spin" /><span>{label}</span></div>
}

export function EmptyState({ title, text }) {
  return <div className="empty-state"><span><Inbox /></span><h3>{title}</h3><p>{text}</p></div>
}

export function StatusBadge({ value }) {
  const labels = {
    active: 'Aktif', inactive: 'Nonaktif', graduated: 'Lulus', open: 'Berjalan', closed: 'Selesai',
    present: 'Hadir', late: 'Terlambat', sick: 'Sakit', excused: 'Izin', absent: 'Alfa', face: 'Wajah', manual: 'Manual',
  }
  return <span className={`status status-${value}`}>{labels[value] || value || '-'}</span>
}

export function Toast({ toast, onClose }) {
  if (!toast) return null
  return (
    <div className={`toast toast-${toast.type || 'success'}`} role="status">
      <span>{toast.message}</span><button type="button" onClick={onClose}><X size={16} /></button>
    </div>
  )
}

export function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?'
}

export function formatDate(value, options = {}) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', ...options }).format(new Date(value))
}

export function formatTime(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date(value))
}
