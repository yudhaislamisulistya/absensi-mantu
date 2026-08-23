import { CheckCircle2, Play, ScanFace, Square, Users, Video, VideoOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { bestMatch, detectFace, loadFaceModels, openCamera, stopCamera } from '../face'
import { EmptyState, Loading, PageHeader, StatusBadge, formatTime, initials } from '../components/ui'

function localDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

export default function Attendance({ setToast }) {
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [sessionData, setSessionData] = useState(null)
  const [records, setRecords] = useState([])
  const [profiles, setProfiles] = useState([])
  const [settings, setSettings] = useState({ face_threshold: 0.5 })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanState, setScanState] = useState({ type: 'idle', message: 'Kamera belum diaktifkan' })
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const detectingRef = useRef(false)
  const lastSeenRef = useRef({})

  useEffect(() => {
    Promise.all([api.get('classes?select=id,name,grade&order=grade,name'), api.get('school_settings?select=face_threshold,late_after&id=eq.1')])
      .then(([classRows, settingRows]) => { setClasses(classRows); if (settingRows[0]) setSettings(settingRows[0]) })
      .catch((error) => setToast({ type: 'error', message: error.message }))
      .finally(() => setLoading(false))
    return () => stopCamera(streamRef.current)
  }, [setToast])

  const loadClass = useCallback(async (selectedClass) => {
    if (!selectedClass) { setSessionData(null); setRecords([]); setProfiles([]); return }
    setLoading(true)
    try {
      const [sessions, faceRows] = await Promise.all([
        api.get(`attendance_sessions?select=*&class_id=eq.${selectedClass}&attendance_date=eq.${localDate()}&limit=1`),
        api.get(`face_profiles?select=student_id,descriptors,students!inner(id,nis,name,class_id)&students.class_id=eq.${selectedClass}`),
      ])
      setProfiles(faceRows)
      const current = sessions[0] || null
      setSessionData(current)
      setRecords(current ? await api.get(`attendance_records?select=*,students(id,nis,name)&session_id=eq.${current.id}&order=students(name).asc`) : [])
    } catch (error) { setToast({ type: 'error', message: error.message }) }
    finally { setLoading(false) }
  }, [setToast])

  useEffect(() => { stopScanner(); loadClass(classId) }, [classId, loadClass])

  function stopScanner() {
    stopCamera(streamRef.current)
    streamRef.current = null
    setScanning(false)
    setScanState({ type: 'idle', message: 'Kamera belum diaktifkan' })
  }

  async function startSession() {
    if (!classId) return
    setBusy(true)
    try {
      const value = await api.rpc('start_attendance_session', { p_class_id: classId })
      setSessionData(value)
      setRecords(await api.get(`attendance_records?select=*,students(id,nis,name)&session_id=eq.${value.id}&order=students(name).asc`))
      setToast({ message: value.status === 'open' ? 'Sesi absensi berhasil dimulai.' : 'Sesi absensi hari ini sudah selesai.' })
    } catch (error) { setToast({ type: 'error', message: error.message }) }
    finally { setBusy(false) }
  }

  async function startScanner() {
    if (!profiles.length) { setToast({ type: 'error', message: 'Belum ada profil wajah siswa pada kelas ini.' }); return }
    setBusy(true)
    try {
      await loadFaceModels()
      streamRef.current = await openCamera(videoRef.current)
      setScanning(true)
      setScanState({ type: 'scanning', message: 'Arahkan satu wajah ke area kamera' })
    } catch (error) {
      setToast({ type: 'error', message: error.name === 'NotAllowedError' ? 'Izin kamera ditolak oleh browser.' : error.message })
    } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!scanning || !sessionData || sessionData.status !== 'open') return undefined
    const interval = window.setInterval(async () => {
      if (detectingRef.current || !videoRef.current?.videoWidth) return
      detectingRef.current = true
      try {
        const detection = await detectFace(videoRef.current)
        if (!detection) { setScanState({ type: 'scanning', message: 'Wajah belum terlihat dengan jelas' }); return }
        const match = bestMatch(detection.descriptor, profiles)
        const threshold = Number(settings.face_threshold || 0.5)
        if (!match || match.distance > threshold) { setScanState({ type: 'unknown', message: 'Wajah tidak dikenali. Coba posisikan ulang.' }); return }
        const now = Date.now()
        if (now - (lastSeenRef.current[match.student_id] || 0) < 8000) return
        lastSeenRef.current[match.student_id] = now
        const saved = await api.rpc('check_in_face', { p_session_id: sessionData.id, p_student_id: match.student_id, p_distance: match.distance })
        setRecords((current) => current.map((row) => row.id === saved.id ? { ...row, ...saved } : row))
        setScanState({ type: 'success', message: `${match.students.name} berhasil hadir`, student: match.students, confidence: saved.confidence })
      } catch (error) {
        setScanState({ type: 'error', message: error.message })
      } finally { detectingRef.current = false }
    }, 1100)
    return () => window.clearInterval(interval)
  }, [profiles, scanning, sessionData, settings.face_threshold])

  async function updateStatus(record, status) {
    try {
      const attended = ['present', 'late'].includes(status)
      const updated = await api.update('attendance_records', record.id, { status, method: 'manual', confidence: null, check_in_at: attended ? new Date().toISOString() : null })
      setRecords((current) => current.map((row) => row.id === record.id ? { ...row, ...updated } : row))
      setToast({ message: `Status ${record.students.name} diperbarui.` })
    } catch (error) { setToast({ type: 'error', message: error.message }) }
  }

  async function closeSession() {
    setBusy(true)
    try {
      const value = await api.rpc('close_attendance_session', { p_session_id: sessionData.id })
      setSessionData(value)
      stopScanner()
      setToast({ message: 'Sesi absensi telah diselesaikan.' })
    } catch (error) { setToast({ type: 'error', message: error.message }) }
    finally { setBusy(false) }
  }

  const selectedClass = classes.find((item) => item.id === classId)
  const counts = useMemo(() => ({
    present: records.filter((row) => row.status === 'present').length,
    late: records.filter((row) => row.status === 'late').length,
    absent: records.filter((row) => row.status === 'absent').length,
    other: records.filter((row) => ['sick', 'excused'].includes(row.status)).length,
  }), [records])

  if (loading && !classes.length) return <Loading label="Menyiapkan absensi..." />

  return (
    <div className="page">
      <PageHeader eyebrow="KEHADIRAN REAL-TIME" title="Absensi Wajah per Kelas" description="Pilih kelas, mulai sesi, lalu arahkan wajah siswa ke kamera." />
      <section className="attendance-setup panel">
        <div><label>Pilih kelas</label><select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Pilih kelas untuk memulai</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <div className="session-meta">{selectedClass && <><span><Users size={17} /> {records.length || '–'} siswa</span><span><ScanFace size={17} /> {profiles.length} wajah terdaftar</span>{sessionData && <StatusBadge value={sessionData.status} />}</>}</div>
        {!sessionData && <button className="button primary" disabled={!classId || busy} onClick={startSession}><Play size={18} /> {busy ? 'Memulai...' : 'Mulai sesi hari ini'}</button>}
        {sessionData?.status === 'open' && <button className="button danger-outline" disabled={busy} onClick={closeSession}><Square size={16} /> Selesaikan sesi</button>}
      </section>

      {!classId ? <div className="panel"><EmptyState title="Pilih kelas terlebih dahulu" text="Sesi absensi dan daftar siswa akan tampil di sini." /></div> : loading ? <Loading /> : !sessionData ? <div className="panel"><EmptyState title={`Belum ada sesi ${selectedClass?.name}`} text="Klik “Mulai sesi hari ini” untuk menyiapkan daftar kehadiran seluruh siswa aktif." /></div> : (
        <>
          <section className="attendance-stats">
            <div><span className="dot present" /><p>Hadir<strong>{counts.present}</strong></p></div><div><span className="dot late" /><p>Terlambat<strong>{counts.late}</strong></p></div><div><span className="dot absent" /><p>Alfa<strong>{counts.absent}</strong></p></div><div><span className="dot other" /><p>Izin / Sakit<strong>{counts.other}</strong></p></div>
          </section>
          <section className="scanner-grid">
            <article className="panel scanner-panel">
              <div className="panel-heading"><div><p className="eyebrow">KAMERA KELAS</p><h2>Pemindai wajah</h2></div>{scanning && <span className="live-badge"><i /> LIVE</span>}</div>
              <div className="camera-frame attendance-camera">
                <video ref={videoRef} muted playsInline />
                {scanning && <div className="scan-line" />}
                {!scanning && <div className="camera-placeholder"><VideoOff /><strong>Kamera nonaktif</strong><span>Aktifkan kamera untuk mulai mengenali wajah.</span></div>}
                {scanning && <div className={`recognition-toast recognition-${scanState.type}`}>{scanState.type === 'success' ? <CheckCircle2 /> : <ScanFace />}<div><strong>{scanState.message}</strong>{scanState.confidence && <small>Kecocokan {Number(scanState.confidence).toFixed(1)}%</small>}</div></div>}
              </div>
              <div className="scanner-controls">{!scanning ? <button className="button primary" disabled={sessionData.status !== 'open' || busy} onClick={startScanner}><Video size={18} /> {busy ? 'Menyiapkan model...' : 'Aktifkan kamera'}</button> : <button className="button secondary" onClick={stopScanner}><VideoOff size={18} /> Matikan kamera</button>}<span>Ambang kecocokan {Math.round(Number(settings.face_threshold) * 100)}%</span></div>
            </article>

            <article className="panel attendance-list-panel">
              <div className="panel-heading"><div><p className="eyebrow">DAFTAR SISWA</p><h2>Kehadiran {selectedClass?.name}</h2></div><span className="panel-badge">{counts.present + counts.late}/{records.length} hadir</span></div>
              {!records.length ? <EmptyState title="Kelas belum memiliki siswa" text="Tambahkan siswa aktif ke kelas ini." /> : <div className="attendance-list">{records.map((record) => <div className="attendance-row" key={record.id}><span className="avatar small student">{initials(record.students.name)}</span><div><strong>{record.students.name}</strong><small>{record.check_in_at ? `${formatTime(record.check_in_at)} · ${record.method === 'face' ? `Wajah ${Number(record.confidence).toFixed(0)}%` : 'Manual'}` : `NIS ${record.students.nis}`}</small></div><select value={record.status} disabled={sessionData.status === 'closed'} className={`status-select status-select-${record.status}`} onChange={(e) => updateStatus(record, e.target.value)}><option value="present">Hadir</option><option value="late">Terlambat</option><option value="sick">Sakit</option><option value="excused">Izin</option><option value="absent">Alfa</option></select></div>)}</div>}
            </article>
          </section>
        </>
      )}
    </div>
  )
}
