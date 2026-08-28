import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, LoaderCircle, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'

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

export function ConfirmDialog({ open, title = 'Hapus data?', description, confirmLabel = 'Ya, hapus', busy, onClose, onConfirm }) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="confirm-content"><span className="warning-icon"><AlertTriangle /></span><p>{description}</p></div>
      <div className="modal-footer">
        <button className="button secondary" type="button" onClick={onClose}>Batal</button>
        <button className="button danger" type="button" disabled={busy} onClick={onConfirm}>{busy ? 'Memproses...' : confirmLabel}</button>
      </div>
    </Modal>
  )
}

export function DataTable({ columns, rows, loading, emptyTitle = 'Belum ada data', emptyText = 'Tambahkan data untuk memulai.' }) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const visibleRows = rows.slice(start, start + pageSize)

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  if (loading) return <Loading />
  if (!rows.length) return <EmptyState title={emptyTitle} text={emptyText} />
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>{columns.map((column) => <td key={column.key} data-label={column.label}>{column.render ? column.render(row) : row[column.key]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-pagination">
        <span>Menampilkan {start + 1}–{Math.min(start + pageSize, rows.length)} dari {rows.length} data</span>
        <label>Baris<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label>
        <div className="pagination-controls">
          <button type="button" aria-label="Halaman sebelumnya" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}><ChevronLeft size={17} /></button>
          <strong>{safePage} / {totalPages}</strong>
          <button type="button" aria-label="Halaman berikutnya" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}><ChevronRight size={17} /></button>
        </div>
      </div>
    </>
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
    present: 'Hadir', late: 'Terlambat', absent: 'Tidak hadir', face: 'Wajah', manual: 'Manual',
  }
  return <span className={`status status-${value}`}>{labels[value] || value || '-'}</span>
}

let feedbackAudio

function getFeedbackAudio() {
  if (!feedbackAudio) {
    feedbackAudio = new window.Audio('/audio/absensi-berhasil.wav')
    feedbackAudio.preload = 'auto'
  }
  return feedbackAudio
}

function speakFeedback() {
  const message = 'Absensi berhasil dilakukan.'
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return
  const utterance = new window.SpeechSynthesisUtterance(message)
  const indonesianVoice = window.speechSynthesis.getVoices()
    .find((voice) => voice.lang.toLowerCase().startsWith('id'))
  utterance.lang = 'id-ID'
  utterance.volume = 1
  utterance.rate = 0.9
  utterance.pitch = 1
  if (indonesianVoice) utterance.voice = indonesianVoice
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

function prepareFeedback() {
  const audio = getFeedbackAudio()
  audio.muted = true
  audio.play().then(() => {
    audio.pause()
    audio.currentTime = 0
    audio.muted = false
  }).catch(() => { audio.muted = false })
}

function playFeedback() {
  const audio = getFeedbackAudio()
  audio.pause()
  audio.currentTime = 0
  audio.muted = false
  audio.volume = 1
  audio.play().catch(speakFeedback)
}

export function Toast({ toast, onClose }) {
  useEffect(() => {
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      prepareFeedback()
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])
  useEffect(() => {
    if (toast?.sound && toast.type !== 'error') playFeedback()
  }, [toast])
  if (!toast) return null
  return (
    <div className={`toast toast-${toast.type || 'success'}`} role={toast.type === 'error' ? 'alert' : 'status'}>
      {toast.type === 'error' ? <AlertTriangle className="toast-icon" /> : <CheckCircle2 className="toast-icon" />}
      <span>{toast.message}</span><button type="button" onClick={onClose} aria-label="Tutup notifikasi"><X size={16} /></button>
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
