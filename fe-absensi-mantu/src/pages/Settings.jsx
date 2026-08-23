import { Clock, Info, LogIn, LogOut, Save, Timer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { Field, Loading, PageHeader } from '../components/ui'

const defaults = { entry_time: '07:00', exit_time: '15:00', tolerance_minutes: 15 }

function shortTime(value) {
  return String(value || '').slice(0, 5)
}

function timeToMinutes(value) {
  const [hours, minutes] = shortTime(value).split(':').map(Number)
  return hours * 60 + minutes
}

function shiftedTime(value, offset) {
  const minutes = (timeToMinutes(value) + offset + 1440) % 1440
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}.${String(minutes % 60).padStart(2, '0')}`
}

export default function SettingsPage({ setToast }) {
  const [form, setForm] = useState(defaults)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('school_settings?select=entry_time,exit_time,tolerance_minutes&id=eq.1')
      .then((rows) => {
        const value = rows[0] || defaults
        setForm({
          entry_time: shortTime(value.entry_time) || defaults.entry_time,
          exit_time: shortTime(value.exit_time) || defaults.exit_time,
          tolerance_minutes: Number(value.tolerance_minutes ?? defaults.tolerance_minutes),
        })
      })
      .catch((error) => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false))
  }, [setToast])

  const rules = useMemo(() => ({
    lateAfter: shiftedTime(form.entry_time, Number(form.tolerance_minutes || 0)),
    earliestExit: shiftedTime(form.exit_time, -Number(form.tolerance_minutes || 0)),
  }), [form.entry_time, form.exit_time, form.tolerance_minutes])

  async function submit(event) {
    event.preventDefault()
    const tolerance = Number(form.tolerance_minutes)
    if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 180) {
      setToast({ type: 'error', message: 'Batas toleransi harus berupa angka 0–180 menit.' })
      return
    }
    if (timeToMinutes(form.exit_time) <= timeToMinutes(form.entry_time)) {
      setToast({ type: 'error', message: 'Waktu pulang harus lebih akhir daripada waktu masuk.' })
      return
    }

    setBusy(true)
    try {
      await api.update('school_settings', 1, {
        entry_time: `${shortTime(form.entry_time)}:00`,
        exit_time: `${shortTime(form.exit_time)}:00`,
        tolerance_minutes: tolerance,
      })
      setForm((current) => ({ ...current, tolerance_minutes: tolerance }))
      setToast({ message: 'Pengaturan waktu absensi berhasil disimpan.' })
    } catch (error) {
      setToast({ type: 'error', message: error.message })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading label="Memuat pengaturan waktu..." />

  return (
    <div className="page settings-page">
      <PageHeader eyebrow="PENGATURAN SISTEM" title="Pengaturan Waktu Absensi" description="Tentukan jadwal masuk, jadwal pulang, dan toleransi yang digunakan pada pemindai wajah." />
      <form className="panel settings-panel" onSubmit={submit}>
        <div className="settings-heading"><span><Clock /></span><div><h2>Jam operasional sekolah</h2><p>Perubahan langsung berlaku untuk proses absensi berikutnya.</p></div></div>
        <div className="settings-form-grid">
          <Field label="Waktu masuk" required><div className="setting-input"><LogIn /><input type="time" required value={form.entry_time} onChange={(event) => setForm({ ...form, entry_time: event.target.value })} /></div></Field>
          <Field label="Waktu pulang" required><div className="setting-input"><LogOut /><input type="time" required value={form.exit_time} onChange={(event) => setForm({ ...form, exit_time: event.target.value })} /></div></Field>
          <Field label="Batas toleransi (menit)" required><div className="setting-input"><Timer /><input type="number" required min="0" max="180" step="1" value={form.tolerance_minutes} onChange={(event) => setForm({ ...form, tolerance_minutes: event.target.value })} /></div></Field>
        </div>
        <div className="settings-rules">
          <div><span className="rule-icon entry"><LogIn /></span><p>Batas hadir tepat waktu<strong>Pukul {rules.lateAfter}</strong><small>Sesudah waktu ini siswa dicatat terlambat.</small></p></div>
          <div><span className="rule-icon exit"><LogOut /></span><p>Absensi pulang paling awal<strong>Pukul {rules.earliestExit}</strong><small>Waktu pulang dikurangi batas toleransi.</small></p></div>
        </div>
        <div className="settings-note"><Info /><p>Satu batas toleransi digunakan untuk dua aturan: tambahan waktu setelah jam masuk dan kelonggaran sebelum jam pulang.</p></div>
        <div className="settings-footer"><button className="button primary" disabled={busy}><Save size={17} /> {busy ? 'Menyimpan...' : 'Simpan pengaturan'}</button></div>
      </form>
    </div>
  )
}
