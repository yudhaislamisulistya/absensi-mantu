import { AlertCircle, CalendarDays, CheckCircle2, Clock3, LogIn, LogOut, RotateCcw, ScanFace, Search, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import FaceScanner from '../components/FaceScanner'
import { ConfirmDialog, DataTable, PageHeader, StatusBadge, formatTime, initials } from '../components/ui'

function localDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

function dateLabel(value) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'Asia/Jakarta' }).format(new Date(`${value}T00:00:00+07:00`))
}

function shortTime(value) {
  return String(value || '--:--').slice(0, 5).replace(':', '.')
}

export default function TeacherAttendance({ setToast }) {
  const [records, setRecords] = useState([])
  const [profiles, setProfiles] = useState([])
  const [settings, setSettings] = useState({ entry_time: '07:00:00', exit_time: '15:00:00', tolerance_minutes: 15, face_threshold: 0.5 })
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [scanState, setScanState] = useState({ type: 'idle', message: 'Kamera belum diaktifkan' })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      await api.rpc('prepare_teacher_attendance')
      const [rows, settingRows, faceRows] = await Promise.all([
        api.get(`teacher_attendance_records?select=*,teachers(id,nip,name)&attendance_date=eq.${localDate()}&order=teachers(name).asc`),
        api.get('school_settings?select=entry_time,exit_time,tolerance_minutes,face_threshold&id=eq.1'),
        api.get('teacher_face_profiles?select=teacher_id,descriptors,teachers!inner(id,nip,name,status)&teachers.status=eq.active'),
      ])
      setRecords(rows)
      setProfiles(faceRows)
      setSettings(settingRows[0] || { entry_time: '07:00:00', exit_time: '15:00:00', tolerance_minutes: 15, face_threshold: 0.5 })
    } catch (error) {
      setToast({ type: 'error', message: error.message, sound: true })
    } finally {
      setLoading(false)
    }
  }, [setToast])

  useEffect(() => { loadData() }, [loadData])

  async function recognizeTeacher(match, event, distance, score) {
    const existing = records.find((row) => row.teacher_id === match.teacher_id)
    const alreadyRecorded = event === 'entry' ? existing?.check_in_at : existing?.check_out_at
    if (alreadyRecorded) {
      return { message: `${match.teachers.name} sudah absen ${event === 'entry' ? 'masuk' : 'pulang'}.`, confidence: score, subline: `NIP ${match.teachers.nip}` }
    }
    const updated = await api.rpc('check_teacher_face', { p_teacher_id: match.teacher_id, p_event: event, p_distance: distance })
    setRecords((current) => current.map((row) => row.id === updated.id ? { ...row, ...updated } : row))
    return { message: `${match.teachers.name} berhasil absen ${event === 'entry' ? 'masuk' : 'pulang'} dengan wajah.`, confidence: event === 'entry' ? updated.confidence : updated.check_out_confidence, subline: `NIP ${match.teachers.nip}` }
  }

  async function recordEvent(record, event) {
    setBusyId(`${record.id}:${event}`)
    try {
      const updated = await api.rpc('record_teacher_attendance', { p_teacher_id: record.teacher_id, p_event: event })
      setRecords((current) => current.map((row) => row.id === record.id ? { ...row, ...updated } : row))
      setToast({ message: `${record.teachers.name} berhasil absen ${event === 'entry' ? 'masuk' : 'pulang'}.`, sound: true })
    } catch (error) {
      setToast({ type: 'error', message: error.message, sound: true })
    } finally {
      setBusyId('')
    }
  }

  async function updateStatus(record, status) {
    setBusyId(`${record.id}:status`)
    try {
      const attended = status !== 'absent'
      const updated = await api.update('teacher_attendance_records', record.id, {
        status,
        check_in_at: attended ? record.check_in_at || new Date().toISOString() : null,
        check_out_at: attended ? record.check_out_at : null,
        confidence: null,
        face_distance: null,
        method: 'manual',
        check_out_confidence: attended ? record.check_out_confidence : null,
        check_out_face_distance: attended ? record.check_out_face_distance : null,
        check_out_method: attended ? record.check_out_method : null,
      })
      setRecords((current) => current.map((row) => row.id === record.id ? { ...row, ...updated } : row))
      setToast({ message: `Status ${record.teachers.name} diperbarui.` })
    } catch (error) {
      setToast({ type: 'error', message: error.message })
    } finally {
      setBusyId('')
    }
  }

  async function resetAttendance() {
    setBusyId('reset')
    try {
      await api.rpc('reset_teacher_attendance')
      setResetOpen(false)
      await loadData()
      setToast({ message: 'Absensi guru hari ini berhasil direset.' })
    } catch (error) {
      setToast({ type: 'error', message: error.message })
    } finally {
      setBusyId('')
    }
  }

  const counts = useMemo(() => ({
    present: records.filter((row) => row.status === 'present').length,
    late: records.filter((row) => row.status === 'late').length,
    absent: records.filter((row) => row.status === 'absent').length,
    checkedOut: records.filter((row) => row.check_out_at).length,
  }), [records])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? records.filter((row) => `${row.teachers?.name || ''} ${row.teachers?.nip || ''}`.toLowerCase().includes(term)) : records
  }, [records, search])

  const columns = [
    { key: 'teacher', label: 'Guru', render: (row) => <div className="teacher-cell"><span className="avatar small">{initials(row.teachers?.name)}</span><span><strong>{row.teachers?.name}</strong><small className="block">NIP {row.teachers?.nip}</small></span></div> },
    { key: 'status', label: 'Status', render: (row) => <select aria-label={`Status ${row.teachers?.name}`} value={row.status} disabled={Boolean(busyId)} className={`status-select status-select-${row.status}`} onChange={(event) => updateStatus(row, event.target.value)}><option value="present">Hadir</option><option value="late">Terlambat</option><option value="absent">Tidak hadir</option></select> },
    { key: 'check_in_at', label: 'Waktu masuk', render: (row) => row.check_in_at ? <span className="time-value"><LogIn /> {formatTime(row.check_in_at)}</span> : '-' },
    { key: 'check_out_at', label: 'Waktu pulang', render: (row) => row.check_out_at ? <span className="time-value"><LogOut /> {formatTime(row.check_out_at)}</span> : '-' },
    { key: 'action', label: 'Aksi', render: (row) => <div className="teacher-attendance-actions">{!row.check_in_at ? <button className="button primary small-button" disabled={Boolean(busyId)} onClick={() => recordEvent(row, 'entry')}><LogIn /> {busyId === `${row.id}:entry` ? 'Mencatat...' : 'Absen masuk'}</button> : !row.check_out_at ? <button className="button secondary small-button" disabled={Boolean(busyId)} onClick={() => recordEvent(row, 'exit')}><LogOut /> {busyId === `${row.id}:exit` ? 'Mencatat...' : 'Absen pulang'}</button> : <span className="checkout-done"><CheckCircle2 /> Selesai</span>}</div> },
  ]

  return (
    <div className="page">
      <PageHeader eyebrow="KEHADIRAN GURU" title="Absensi Guru" description="Absensi wajah masuk dan pulang guru dengan status otomatis mengikuti pengaturan waktu sekolah; koreksi manual tetap tersedia untuk admin." />
      {scanState.type !== 'idle' && <div className={`scan-status-banner scan-status-${scanState.type}`} role="status">{scanState.type === 'success' ? <CheckCircle2 /> : scanState.type === 'scanning' ? <ScanFace /> : <AlertCircle />}<div><strong>{scanState.type === 'success' ? 'Absensi guru berhasil' : scanState.type === 'scanning' ? 'Pemindaian guru berjalan' : 'Absensi guru belum berhasil'}</strong><span>{scanState.message}</span></div></div>}
      <section className="attendance-setup panel">
        <div className="school-attendance-title"><span><Users size={19} /></span><div><label>Absensi guru hari ini</label><strong><CalendarDays size={14} /> {dateLabel(localDate())}</strong><small>{records.length} guru aktif</small></div></div>
        <div className="session-meta"><span><ScanFace size={17} /> {profiles.length} wajah guru</span><span><Clock3 size={17} /> {shortTime(settings.entry_time)}–{shortTime(settings.exit_time)} · toleransi {settings.tolerance_minutes} menit</span><StatusBadge value="open" /></div>
        <button className="button secondary" disabled={Boolean(busyId)} onClick={() => setResetOpen(true)}><RotateCcw size={16} /> Reset absensi</button>
      </section>
      <section className="attendance-stats">
        <div><span className="dot present" /><p>Hadir<strong>{counts.present}</strong></p></div>
        <div><span className="dot late" /><p>Terlambat<strong>{counts.late}</strong></p></div>
        <div><span className="dot absent" /><p>Tidak hadir<strong>{counts.absent}</strong></p></div>
        <div><span className="dot checked-out" /><p>Sudah pulang<strong>{counts.checkedOut}</strong></p></div>
      </section>
      <section className="scanner-grid teacher-scanner-grid">
        <FaceScanner profiles={profiles} identityKey="teacher_id" personKey="teachers" threshold={Number(settings.face_threshold || 0.5)} entryTime={settings.entry_time} exitTime={settings.exit_time} tolerance={Number(settings.tolerance_minutes || 0)} disabled={loading} subjectLabel="guru" onRecognized={recognizeTeacher} onStateChange={setScanState} setToast={setToast} />
        <article className="panel table-panel attendance-list-panel">
          <div className="table-toolbar"><div><p className="eyebrow">DAFTAR GURU</p><h2>Kehadiran hari ini</h2></div><label className="search-box"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau NIP..." /></label></div>
          <DataTable columns={columns} rows={filtered} loading={loading} emptyTitle="Belum ada guru aktif" emptyText="Tambahkan guru aktif agar dapat melakukan absensi." />
        </article>
      </section>
      <ConfirmDialog open={resetOpen} title="Reset absensi guru hari ini?" description="Seluruh status serta waktu masuk dan pulang guru hari ini akan dikosongkan untuk pengujian ulang." confirmLabel="Ya, reset absensi" busy={busyId === 'reset'} onClose={() => setResetOpen(false)} onConfirm={resetAttendance} />
    </div>
  )
}
