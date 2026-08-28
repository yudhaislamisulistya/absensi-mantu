import { AlertCircle, CalendarDays, CheckCircle2, LogIn, LogOut, Play, RotateCcw, ScanFace, Search, Square, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import FaceScanner from '../components/FaceScanner'
import { ConfirmDialog, EmptyState, Loading, PageHeader, StatusBadge, formatTime, initials } from '../components/ui'

function localDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

function dateLabel(value) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'Asia/Jakarta' }).format(new Date(`${value}T00:00:00+07:00`))
}

function timeLabel(value) {
  return String(value || '--:--').slice(0, 5).replace(':', '.')
}

function timeMinutes(value) {
  const [hours, minutes] = String(value || '00:00').slice(0, 5).split(':').map(Number)
  return hours * 60 + minutes
}

function shiftedTime(value, offset) {
  const minutes = (timeMinutes(value) + offset + 1440) % 1440
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}.${String(minutes % 60).padStart(2, '0')}`
}

function jakartaMinutesNow() {
  const parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }).formatToParts(new Date())
  return Number(parts.find((part) => part.type === 'hour')?.value || 0) * 60 + Number(parts.find((part) => part.type === 'minute')?.value || 0)
}

export default function Attendance({ setToast }) {
  const [classes, setClasses] = useState([])
  const [classFilter, setClassFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sessionData, setSessionData] = useState(null)
  const [records, setRecords] = useState([])
  const [profiles, setProfiles] = useState([])
  const [settings, setSettings] = useState({ entry_time: '07:00:00', exit_time: '15:00:00', tolerance_minutes: 15, face_threshold: 0.5 })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [scanState, setScanState] = useState({ type: 'idle', message: 'Kamera belum diaktifkan' })

  const loadRecords = useCallback(async (sessionId) => {
    if (!sessionId) return []
    return api.get(`attendance_records?select=*,students(id,nis,name),classes(id,name)&session_id=eq.${sessionId}&order=students(name).asc`)
  }, [])

  const loadAttendance = useCallback(async () => {
    setLoading(true)
    try {
      const [classRows, settingRows, sessions, faceRows] = await Promise.all([
        api.get('classes?select=id,name,grade&order=grade,name'),
        api.get('school_settings?select=entry_time,exit_time,tolerance_minutes,face_threshold&id=eq.1'),
        api.get(`attendance_sessions?select=*&attendance_date=eq.${localDate()}&limit=1`),
        api.get('face_profiles?select=student_id,descriptors,students!inner(id,nis,name,class_id,status,classes(id,name))&students.status=eq.active&students.class_id=not.is.null'),
      ])
      const current = sessions[0] || null
      setClasses(classRows)
      setSettings(settingRows[0] || { entry_time: '07:00:00', exit_time: '15:00:00', tolerance_minutes: 15, face_threshold: 0.5 })
      setSessionData(current)
      setProfiles(faceRows)
      setRecords(await loadRecords(current?.id))
    } catch (error) {
      setToast({ type: 'error', message: error.message })
    } finally {
      setLoading(false)
    }
  }, [loadRecords, setToast])

  useEffect(() => {
    loadAttendance()
  }, [loadAttendance])

  async function startSession() {
    setBusy(true)
    try {
      const value = await api.rpc('start_attendance_session')
      setSessionData(value)
      setRecords(await loadRecords(value.id))
      setToast({ message: value.status === 'open' ? 'Sesi absensi sekolah berhasil dimulai.' : 'Sesi absensi hari ini sudah selesai.' })
    } catch (error) {
      setToast({ type: 'error', message: error.message })
    } finally {
      setBusy(false)
    }
  }


  async function recognizeStudent(match, mode, distance, score) {
    const existing = records.find((row) => row.student_id === match.student_id)
    const alreadyRecorded = mode === 'entry' ? existing?.check_in_at : existing?.check_out_at
    if (alreadyRecorded) {
      return { message: `${match.students.name} sudah absen ${mode === 'entry' ? 'masuk' : 'pulang'}.`, confidence: score, subline: match.students.classes?.name, notify: false }
    }
    const rpcName = mode === 'entry' ? 'check_in_face' : 'check_out_face'
    const saved = await api.rpc(rpcName, { p_session_id: sessionData.id, p_student_id: match.student_id, p_distance: distance })
    setRecords((current) => current.some((row) => row.id === saved.id)
      ? current.map((row) => row.id === saved.id ? { ...row, ...saved } : row)
      : [...current, { ...saved, students: match.students, classes: match.students.classes }])
    return { message: `${match.students.name} berhasil absen ${mode === 'entry' ? 'masuk' : 'pulang'}.`, confidence: mode === 'entry' ? saved.confidence : saved.check_out_confidence, subline: match.students.classes?.name }
  }

  async function updateStatus(record, status) {
    try {
      const attended = ['present', 'late'].includes(status)
      const updated = await api.update('attendance_records', record.id, {
        status,
        method: 'manual',
        confidence: null,
        face_distance: null,
        check_in_at: attended ? new Date().toISOString() : null,
        check_out_at: attended ? record.check_out_at : null,
        check_out_confidence: attended ? record.check_out_confidence : null,
        check_out_face_distance: attended ? record.check_out_face_distance : null,
        check_out_method: attended ? record.check_out_method : null,
      })
      setRecords((current) => current.map((row) => row.id === record.id ? { ...row, ...updated } : row))
      setToast({ message: `Status ${record.students.name} diperbarui.` })
    } catch (error) {
      setToast({ type: 'error', message: error.message })
    }
  }

  async function updateCheckout(record) {
    const earliestExit = timeMinutes(settings.exit_time) - Number(settings.tolerance_minutes || 0)
    if (jakartaMinutesNow() < earliestExit) {
      setToast({ type: 'error', message: `Absensi pulang baru dapat dilakukan mulai pukul ${shiftedTime(settings.exit_time, -Number(settings.tolerance_minutes || 0))}.` })
      return
    }
    try {
      const updated = await api.update('attendance_records', record.id, {
        check_out_at: new Date().toISOString(),
        check_out_confidence: null,
        check_out_face_distance: null,
        check_out_method: 'manual',
      })
      setRecords((current) => current.map((row) => row.id === record.id ? { ...row, ...updated } : row))
      setToast({ message: `Absensi pulang ${record.students.name} berhasil dicatat manual.` })
    } catch (error) {
      setToast({ type: 'error', message: error.message })
    }
  }

  async function closeSession() {
    setBusy(true)
    try {
      const value = await api.rpc('close_attendance_session', { p_session_id: sessionData.id })
      setSessionData(value)
      setToast({ message: 'Sesi absensi sekolah telah diselesaikan.' })
    } catch (error) {
      setToast({ type: 'error', message: error.message })
    } finally {
      setBusy(false)
    }
  }

  async function resetSession() {
    setBusy(true)
    try {
      const value = await api.rpc('reset_attendance_session', { p_session_id: sessionData.id })
      setSessionData(value)
      setRecords(await loadRecords(value.id))
      setResetOpen(false)
      setToast({ message: 'Absensi hari ini berhasil direset dan sesi dibuka kembali.' })
    } catch (error) {
      setToast({ type: 'error', message: error.message })
    } finally {
      setBusy(false)
    }
  }

  const counts = useMemo(() => ({
    present: records.filter((row) => row.status === 'present').length,
    late: records.filter((row) => row.status === 'late').length,
    absent: records.filter((row) => row.status === 'absent').length,
    checkedOut: records.filter((row) => row.check_out_at).length,
  }), [records])

  const filteredRecords = useMemo(() => records.filter((record) => {
    const matchesClass = !classFilter || record.class_id === classFilter
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || `${record.students?.name || ''} ${record.students?.nis || ''} ${record.classes?.name || ''}`.toLowerCase().includes(term)
    return matchesClass && matchesSearch
  }), [classFilter, records, search])

  if (loading) return <Loading label="Menyiapkan absensi sekolah..." />

  return (
    <div className="page">
      <PageHeader eyebrow="KEHADIRAN REAL-TIME" title="Absensi Siswa" description="Satu pos absensi di ruang guru untuk mencatat kehadiran seluruh siswa di sekolah." />
      {scanState.type !== 'idle' && <div className={`scan-status-banner scan-status-${scanState.type}`} role="status">{scanState.type === 'success' ? <CheckCircle2 /> : scanState.type === 'scanning' ? <ScanFace /> : <AlertCircle />}<div><strong>{scanState.type === 'success' ? 'Absensi berhasil' : scanState.type === 'scanning' ? 'Pemindaian berjalan' : 'Absensi belum berhasil'}</strong><span>{scanState.message}</span></div></div>}
      <section className="attendance-setup panel">
        <div className="school-attendance-title"><span><Users size={19} /></span><div><label>Absensi sekolah</label><strong><CalendarDays size={14} /> {dateLabel(sessionData?.attendance_date || localDate())}</strong><small>{records.length} siswa aktif dari {classes.length} kelas</small></div></div>
        <div className="session-meta"><span><ScanFace size={17} /> {profiles.length} wajah terdaftar</span><span>{timeLabel(settings.entry_time)}–{timeLabel(settings.exit_time)} · toleransi {settings.tolerance_minutes} menit</span>{sessionData && <StatusBadge value={sessionData.status} />}</div>
        {!sessionData && <button className="button primary" disabled={busy} onClick={startSession}><Play size={18} /> {busy ? 'Memulai...' : 'Mulai sesi hari ini'}</button>}
        {sessionData && <button className="button secondary" disabled={busy} onClick={() => setResetOpen(true)}><RotateCcw size={16} /> Reset absensi</button>}
        {sessionData?.status === 'open' && <button className="button danger-outline" disabled={busy} onClick={closeSession}><Square size={16} /> Selesaikan sesi</button>}
      </section>

      {!sessionData ? <div className="panel"><EmptyState title="Belum ada sesi absensi hari ini" text="Mulai sesi untuk menyiapkan status seluruh siswa aktif di sekolah." /></div> : (
        <>
          <section className="attendance-stats">
            <div><span className="dot present" /><p>Hadir<strong>{counts.present}</strong></p></div>
            <div><span className="dot late" /><p>Terlambat<strong>{counts.late}</strong></p></div>
            <div><span className="dot absent" /><p>Tidak hadir<strong>{counts.absent}</strong></p></div>
            <div><span className="dot checked-out" /><p>Sudah pulang<strong>{counts.checkedOut}</strong></p></div>
          </section>
          <section className="scanner-grid">
            <FaceScanner profiles={profiles} identityKey="student_id" personKey="students" threshold={Number(settings.face_threshold || 0.5)} entryTime={settings.entry_time} exitTime={settings.exit_time} tolerance={Number(settings.tolerance_minutes || 0)} disabled={sessionData.status !== 'open'} subjectLabel="siswa" onRecognized={recognizeStudent} onStateChange={setScanState} setToast={setToast} />

            <article className="panel attendance-list-panel">
              <div className="panel-heading"><div><p className="eyebrow">DAFTAR SISWA</p><h2>Kehadiran sekolah</h2></div><span className="panel-badge">{counts.present + counts.late}/{records.length} hadir</span></div>
              <div className="attendance-filters"><label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau NIS..." /></label><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="">Semua kelas</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              {!filteredRecords.length ? <EmptyState title="Siswa tidak ditemukan" text="Ubah kata kunci atau filter kelas." /> : <div className="attendance-list">{filteredRecords.map((record) => <div className="attendance-row" key={record.id}><span className="avatar small student">{initials(record.students.name)}</span><div><strong>{record.students.name}</strong><small>{record.classes?.name || 'Tanpa kelas'} · NIS {record.students.nis}</small><small className="attendance-times"><span><LogIn /> {record.check_in_at ? formatTime(record.check_in_at) : '--:--'}</span><span><LogOut /> {record.check_out_at ? formatTime(record.check_out_at) : '--:--'}</span></small></div><div className="attendance-row-actions"><select value={record.status} disabled={sessionData.status === 'closed'} className={`status-select status-select-${record.status}`} onChange={(event) => updateStatus(record, event.target.value)}><option value="present">Hadir</option><option value="late">Terlambat</option><option value="absent">Tidak hadir</option></select>{record.check_out_at ? <span className="checkout-done"><CheckCircle2 /> Sudah pulang</span> : <button type="button" className="checkout-button" disabled={sessionData.status === 'closed' || !record.check_in_at || !['present', 'late'].includes(record.status)} onClick={() => updateCheckout(record)}><LogOut /> Catat pulang</button>}</div></div>)}</div>}
            </article>
          </section>
        </>
      )}
      <ConfirmDialog open={resetOpen} title="Reset absensi hari ini?" description="Seluruh status, waktu masuk, waktu pulang, skor verifikasi, dan jarak wajah hari ini akan dikosongkan. Semua siswa kembali menjadi tidak hadir dan sesi dibuka lagi untuk pengujian." confirmLabel="Ya, reset absensi" busy={busy} onClose={() => setResetOpen(false)} onConfirm={resetSession} />
    </div>
  )
}
