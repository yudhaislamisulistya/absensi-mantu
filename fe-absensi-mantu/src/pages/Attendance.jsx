import { CalendarDays, CheckCircle2, Play, RotateCcw, ScanFace, Search, Square, Users, Video, VideoOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { bestMatch, detectFace, loadFaceModels, openCamera, stopCamera } from '../face'
import { ConfirmDialog, EmptyState, Loading, PageHeader, StatusBadge, formatTime, initials } from '../components/ui'

function localDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

function dateLabel(value) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'Asia/Jakarta' }).format(new Date(`${value}T00:00:00+07:00`))
}

export default function Attendance({ setToast }) {
  const [classes, setClasses] = useState([])
  const [classFilter, setClassFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sessionData, setSessionData] = useState(null)
  const [records, setRecords] = useState([])
  const [profiles, setProfiles] = useState([])
  const [settings, setSettings] = useState({ face_threshold: 0.5 })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanState, setScanState] = useState({ type: 'idle', message: 'Kamera belum diaktifkan' })
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const detectingRef = useRef(false)
  const lastSeenRef = useRef({})

  const loadRecords = useCallback(async (sessionId) => {
    if (!sessionId) return []
    return api.get(`attendance_records?select=*,students(id,nis,name),classes(id,name)&session_id=eq.${sessionId}&order=students(name).asc`)
  }, [])

  const loadAttendance = useCallback(async () => {
    setLoading(true)
    try {
      const [classRows, settingRows, sessions, faceRows] = await Promise.all([
        api.get('classes?select=id,name,grade&order=grade,name'),
        api.get('school_settings?select=face_threshold,late_after&id=eq.1'),
        api.get(`attendance_sessions?select=*&attendance_date=eq.${localDate()}&limit=1`),
        api.get('face_profiles?select=student_id,descriptors,students!inner(id,nis,name,class_id,status,classes(id,name))&students.status=eq.active&students.class_id=not.is.null'),
      ])
      const current = sessions[0] || null
      setClasses(classRows)
      setSettings(settingRows[0] || { face_threshold: 0.5 })
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
    return () => stopCamera(streamRef.current)
  }, [loadAttendance])

  function stopScanner() {
    stopCamera(streamRef.current)
    streamRef.current = null
    setScanning(false)
    setScanState({ type: 'idle', message: 'Kamera belum diaktifkan' })
  }

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

  async function startScanner() {
    if (!profiles.length) {
      setToast({ type: 'error', message: 'Belum ada profil wajah siswa aktif yang dapat dipindai.' })
      return
    }
    setBusy(true)
    try {
      await loadFaceModels()
      streamRef.current = await openCamera(videoRef.current)
      setScanning(true)
      setScanState({ type: 'scanning', message: 'Arahkan satu wajah ke area kamera' })
    } catch (error) {
      setToast({ type: 'error', message: error.name === 'NotAllowedError' ? 'Izin kamera ditolak oleh browser.' : error.message })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!scanning || !sessionData || sessionData.status !== 'open') return undefined
    const interval = window.setInterval(async () => {
      if (detectingRef.current || !videoRef.current?.videoWidth) return
      detectingRef.current = true
      try {
        const detection = await detectFace(videoRef.current)
        if (!detection) {
          setScanState({ type: 'scanning', message: 'Wajah belum terlihat dengan jelas' })
          return
        }
        const match = bestMatch(detection.descriptor, profiles)
        const threshold = Number(settings.face_threshold || 0.5)
        if (!match || match.distance > threshold) {
          setScanState({ type: 'unknown', message: 'Wajah tidak dikenali. Coba posisikan ulang.' })
          return
        }
        const now = Date.now()
        if (now - (lastSeenRef.current[match.student_id] || 0) < 8000) return
        lastSeenRef.current[match.student_id] = now
        const saved = await api.rpc('check_in_face', { p_session_id: sessionData.id, p_student_id: match.student_id, p_distance: match.distance })
        setRecords((current) => current.some((row) => row.id === saved.id)
          ? current.map((row) => row.id === saved.id ? { ...row, ...saved } : row)
          : [...current, { ...saved, students: match.students, classes: match.students.classes }])
        setScanState({ type: 'success', message: `${match.students.name} berhasil absen`, student: match.students, confidence: saved.confidence })
      } catch (error) {
        setScanState({ type: 'error', message: error.message })
      } finally {
        detectingRef.current = false
      }
    }, 1100)
    return () => window.clearInterval(interval)
  }, [profiles, scanning, sessionData, settings.face_threshold])

  async function updateStatus(record, status) {
    try {
      const attended = ['present', 'late'].includes(status)
      const updated = await api.update('attendance_records', record.id, {
        status,
        method: 'manual',
        confidence: null,
        check_in_at: attended ? new Date().toISOString() : null,
      })
      setRecords((current) => current.map((row) => row.id === record.id ? { ...row, ...updated } : row))
      setToast({ message: `Status ${record.students.name} diperbarui.` })
    } catch (error) {
      setToast({ type: 'error', message: error.message })
    }
  }

  async function closeSession() {
    setBusy(true)
    try {
      const value = await api.rpc('close_attendance_session', { p_session_id: sessionData.id })
      setSessionData(value)
      stopScanner()
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
      stopScanner()
      const value = await api.rpc('reset_attendance_session', { p_session_id: sessionData.id })
      setSessionData(value)
      setRecords(await loadRecords(value.id))
      lastSeenRef.current = {}
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
      <section className="attendance-setup panel">
        <div className="school-attendance-title"><span><Users size={19} /></span><div><label>Absensi sekolah</label><strong><CalendarDays size={14} /> {dateLabel(sessionData?.attendance_date || localDate())}</strong><small>{records.length} siswa aktif dari {classes.length} kelas</small></div></div>
        <div className="session-meta"><span><ScanFace size={17} /> {profiles.length} wajah terdaftar</span>{sessionData && <StatusBadge value={sessionData.status} />}</div>
        {!sessionData && <button className="button primary" disabled={busy} onClick={startSession}><Play size={18} /> {busy ? 'Memulai...' : 'Mulai sesi hari ini'}</button>}
        {sessionData && <button className="button secondary" disabled={busy} onClick={() => setResetOpen(true)}><RotateCcw size={16} /> Reset absensi</button>}
        {sessionData?.status === 'open' && <button className="button danger-outline" disabled={busy} onClick={closeSession}><Square size={16} /> Selesaikan sesi</button>}
      </section>

      {!sessionData ? <div className="panel"><EmptyState title="Belum ada sesi absensi hari ini" text="Mulai sesi untuk menyiapkan status seluruh siswa aktif di sekolah." /></div> : (
        <>
          <section className="attendance-stats attendance-stats-three">
            <div><span className="dot present" /><p>Hadir<strong>{counts.present}</strong></p></div>
            <div><span className="dot late" /><p>Terlambat<strong>{counts.late}</strong></p></div>
            <div><span className="dot absent" /><p>Tidak hadir<strong>{counts.absent}</strong></p></div>
          </section>
          <section className="scanner-grid">
            <article className="panel scanner-panel">
              <div className="panel-heading"><div><p className="eyebrow">POS RUANG GURU</p><h2>Pemindai wajah</h2></div>{scanning && <span className="live-badge"><i /> LIVE</span>}</div>
              <div className="camera-frame attendance-camera">
                <video ref={videoRef} muted playsInline />
                {scanning && <div className="scan-line" />}
                {!scanning && <div className="camera-placeholder"><VideoOff /><strong>Kamera nonaktif</strong><span>Aktifkan kamera untuk mulai mengenali wajah siswa.</span></div>}
                {scanning && <div className={`recognition-toast recognition-${scanState.type}`}>{scanState.type === 'success' ? <CheckCircle2 /> : <ScanFace />}<div><strong>{scanState.message}</strong>{scanState.student?.classes?.name && <small>{scanState.student.classes.name} · kecocokan {Number(scanState.confidence).toFixed(1)}%</small>}</div></div>}
              </div>
              <div className="scanner-controls">{!scanning ? <button className="button primary" disabled={sessionData.status !== 'open' || busy} onClick={startScanner}><Video size={18} /> {busy ? 'Menyiapkan model...' : 'Aktifkan kamera'}</button> : <button className="button secondary" onClick={stopScanner}><VideoOff size={18} /> Matikan kamera</button>}<span>Ambang kecocokan {Math.round(Number(settings.face_threshold) * 100)}%</span></div>
            </article>

            <article className="panel attendance-list-panel">
              <div className="panel-heading"><div><p className="eyebrow">DAFTAR SISWA</p><h2>Kehadiran sekolah</h2></div><span className="panel-badge">{counts.present + counts.late}/{records.length} hadir</span></div>
              <div className="attendance-filters"><label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau NIS..." /></label><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="">Semua kelas</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
              {!filteredRecords.length ? <EmptyState title="Siswa tidak ditemukan" text="Ubah kata kunci atau filter kelas." /> : <div className="attendance-list">{filteredRecords.map((record) => <div className="attendance-row" key={record.id}><span className="avatar small student">{initials(record.students.name)}</span><div><strong>{record.students.name}</strong><small>{record.classes?.name || 'Tanpa kelas'} · {record.check_in_at ? `${formatTime(record.check_in_at)} · ${record.method === 'face' ? `Wajah ${Number(record.confidence).toFixed(0)}%` : 'Manual'}` : `NIS ${record.students.nis}`}</small></div><select value={record.status} disabled={sessionData.status === 'closed'} className={`status-select status-select-${record.status}`} onChange={(event) => updateStatus(record, event.target.value)}><option value="present">Hadir</option><option value="late">Terlambat</option><option value="absent">Tidak hadir</option></select></div>)}</div>}
            </article>
          </section>
        </>
      )}
      <ConfirmDialog open={resetOpen} title="Reset absensi hari ini?" description="Seluruh status, waktu check-in, dan nilai kecocokan hari ini akan dikosongkan. Semua siswa kembali menjadi tidak hadir dan sesi dibuka lagi untuk pengujian." confirmLabel="Ya, reset absensi" busy={busy} onClose={() => setResetOpen(false)} onConfirm={resetSession} />
    </div>
  )
}
