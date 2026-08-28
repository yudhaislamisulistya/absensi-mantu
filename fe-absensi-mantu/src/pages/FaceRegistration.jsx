import { Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, ImagePlus, RefreshCw, ShieldCheck, Trash2, UserRound, VideoOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { detectFace, faceQuality, loadFaceModels, openCamera, stopCamera, videoThumbnail } from '../face'
import { ConfirmDialog, EmptyState, Loading, Modal, PageHeader, SearchBox, formatDate, initials } from '../components/ui'

const typeConfig = {
  student: { label: 'siswa', identifier: 'NIS', profileTable: 'face_profiles', foreignKey: 'student_id', profileKey: 'face_profiles' },
  teacher: { label: 'guru', identifier: 'NIP', profileTable: 'teacher_face_profiles', foreignKey: 'teacher_id', profileKey: 'teacher_face_profiles' },
}

function CaptureModal({ person, type, onClose, onSaved, setToast }) {
  const config = typeConfig[type]
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [samples, setSamples] = useState([])
  const [photo, setPhoto] = useState('')
  const [message, setMessage] = useState('Menyiapkan model pengenalan wajah...')
  const prompts = ['Hadapkan wajah lurus ke kamera', 'Miringkan wajah sedikit ke kiri', 'Miringkan wajah sedikit ke kanan', 'Angkat dagu sedikit', 'Turunkan dagu sedikit']

  useEffect(() => {
    let active = true
    async function start() {
      try {
        await loadFaceModels()
        if (!active) return
        streamRef.current = await openCamera(videoRef.current)
        setReady(true)
        setMessage('Kamera siap. Pastikan wajah terang dan tidak tertutup.')
      } catch (error) {
        setMessage(error.name === 'NotAllowedError' ? 'Izin kamera ditolak. Aktifkan izin kamera pada browser.' : `Kamera tidak dapat dibuka: ${error.message}`)
      }
    }
    start()
    return () => { active = false; stopCamera(streamRef.current) }
  }, [])

  async function capture() {
    if (!ready || busy || samples.length >= 5) return
    setBusy(true)
    setMessage('Mendeteksi satu wajah...')
    try {
      const result = await detectFace(videoRef.current, 416)
      const qualityError = faceQuality(result, videoRef.current)
      if (qualityError) {
        setMessage(qualityError)
        return
      }
      const next = [...samples, Array.from(result.descriptor)]
      setSamples(next)
      if (!photo) setPhoto(videoThumbnail(videoRef.current))
      setMessage(next.length === 5 ? 'Lima sampel berkualitas berhasil diambil. Profil siap disimpan.' : `Sampel ${next.length} berhasil. ${prompts[next.length]}`)
    } catch (error) {
      setMessage(`Gagal mengambil sampel: ${error.message}`)
    } finally { setBusy(false) }
  }

  async function save() {
    setBusy(true)
    try {
      await api.upsert(config.profileTable, { [config.foreignKey]: person.id, descriptors: samples, photo_data: photo, sample_count: samples.length }, config.foreignKey)
      setToast({ message: `Wajah ${person.name} berhasil didaftarkan.` })
      onSaved()
    } catch (error) { setToast({ type: 'error', message: error.message }) }
    finally { setBusy(false) }
  }

  const identifier = type === 'student' ? person.nis : person.nip
  const secondary = type === 'student' ? person.classes?.name || 'Tanpa kelas' : 'Guru aktif'

  return (
    <Modal open title={`Registrasi wajah — ${person.name}`} description={`Ambil lima variasi wajah ${config.label} untuk pencocokan yang stabil.`} size="lg" onClose={onClose}>
      <div className="modal-body capture-layout">
        <div className="camera-frame registration-camera"><video ref={videoRef} muted playsInline /><div className="face-guide"><i /><i /><i /><i /></div>{!ready && <div className="camera-loading"><Camera /><span>{message}</span></div>}</div>
        <div className="capture-sidebar">
          <div className="capture-person"><span className="avatar">{initials(person.name)}</span><div><strong>{person.name}</strong><small>{config.identifier} {identifier} · {secondary}</small></div></div>
          <div className="capture-progress">{[0, 1, 2, 3, 4].map((index) => <div className={samples[index] ? 'done' : index === samples.length ? 'current' : ''} key={index}><span>{samples[index] ? <Check size={16} /> : index + 1}</span><div><strong>Sampel {index + 1}</strong><small>{['Posisi lurus', 'Sedikit ke kiri', 'Sedikit ke kanan', 'Dagu sedikit naik', 'Dagu sedikit turun'][index]}</small></div></div>)}</div>
          <div className="capture-message"><ShieldCheck size={17} /><span>{message}</span></div>
          <button className="button secondary full" type="button" disabled={!ready || busy || samples.length >= 5} onClick={capture}><Camera size={18} /> {busy ? 'Mendeteksi...' : samples.length >= 5 ? 'Sampel lengkap' : `Ambil sampel ${samples.length + 1}`}</button>
        </div>
      </div>
      <div className="modal-footer"><button className="button secondary" type="button" onClick={onClose}>Batal</button><button className="button primary" type="button" disabled={samples.length < 5 || busy} onClick={save}><CheckCircle2 size={18} /> Simpan profil wajah</button></div>
    </Modal>
  )
}

export default function FaceRegistration({ setToast }) {
  const [type, setType] = useState('student')
  const [students, setStudents] = useState([])
  const [teachers, setTeachers] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [studentRows, teacherRows, classRows] = await Promise.all([
        api.get('students?select=id,nis,name,class_id,status,classes(id,name),face_profiles(student_id,sample_count,registered_at)&status=eq.active&order=name.asc'),
        api.get('teachers?select=id,nip,name,status,teacher_face_profiles(teacher_id,sample_count,registered_at)&status=eq.active&order=name.asc'),
        api.get('classes?select=id,name,grade&order=grade,name'),
      ])
      setStudents(studentRows)
      setTeachers(teacherRows)
      setClasses(classRows)
    } catch (error) { setToast({ type: 'error', message: error.message }) }
    finally { setLoading(false) }
  }, [setToast])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const prepare = () => loadFaceModels().catch(() => {})
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(prepare, { timeout: 2000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(prepare, 400)
    return () => window.clearTimeout(id)
  }, [])

  const config = typeConfig[type]
  const source = type === 'student' ? students : teachers
  const rows = useMemo(() => source.filter((person) => {
    const matchesClass = type === 'teacher' || !classFilter || person.class_id === classFilter
    const identifier = type === 'student' ? person.nis : person.nip
    return matchesClass && `${identifier} ${person.name}`.toLowerCase().includes(search.toLowerCase())
  }), [classFilter, search, source, type])
  const registered = source.filter((person) => person[config.profileKey]).length
  const pageSize = 12
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const visibleRows = rows.slice(start, start + pageSize)

  function changeType(value) {
    setType(value)
    setSearch('')
    setClassFilter('')
    setPage(1)
    setSelected(null)
  }

  async function removeProfile() {
    setBusy(true)
    try {
      await api.remove(config.profileTable, deleting.id, config.foreignKey)
      setToast({ message: `Profil wajah ${deleting.name} berhasil dihapus.` })
      setDeleting(null)
      await load()
    } catch (error) { setToast({ type: 'error', message: error.message }) }
    finally { setBusy(false) }
  }

  return (
    <div className="page">
      <PageHeader eyebrow="PENGENALAN WAJAH" title="Registrasi Wajah" description="Kelola lima sampel wajah siswa dan guru untuk absensi biometrik masuk maupun pulang." />
      <div className="report-type-tabs face-type-tabs"><button className={type === 'student' ? 'active' : ''} onClick={() => changeType('student')}>Wajah siswa</button><button className={type === 'teacher' ? 'active' : ''} onClick={() => changeType('teacher')}>Wajah guru</button></div>
      <section className="face-summary">
        <div><span className="stat-icon teal"><UserRound /></span><p>Total {config.label} aktif<strong>{source.length}</strong></p></div>
        <div><span className="stat-icon blue"><CheckCircle2 /></span><p>Sudah terdaftar<strong>{registered}</strong></p></div>
        <div><span className="stat-icon amber"><VideoOff /></span><p>Belum terdaftar<strong>{source.length - registered}</strong></p></div>
        <div className="privacy-note"><ShieldCheck /><p><strong>Privasi terjaga</strong><span>Template wajah hanya dapat diakses admin.</span></p></div>
      </section>
      <section className="panel face-panel">
        <div className="table-toolbar"><SearchBox value={search} onChange={(value) => { setSearch(value); setPage(1) }} placeholder={`Cari nama atau ${config.identifier}...`} />{type === 'student' && <select value={classFilter} onChange={(event) => { setClassFilter(event.target.value); setPage(1) }}><option value="">Semua kelas</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}</div>
        {loading ? <Loading /> : !rows.length ? <EmptyState title={`${config.label[0].toUpperCase()}${config.label.slice(1)} tidak ditemukan`} text={`Periksa pencarian atau tambahkan data ${config.label} terlebih dahulu.`} /> : (
          <div className="face-card-grid">{visibleRows.map((person) => {
            const profile = person[config.profileKey]
            const identifier = type === 'student' ? person.nis : person.nip
            const secondary = type === 'student' ? person.classes?.name || 'Tanpa kelas' : 'Guru aktif'
            return <article className="face-card" key={person.id}><div className="face-photo"><span>{initials(person.name)}</span>{profile && <i><Check size={14} /></i>}</div><div className="face-card-copy"><strong>{person.name}</strong><small>{config.identifier} {identifier} · {secondary}</small>{profile ? <p className="registered-copy"><CheckCircle2 size={15} /> {profile.sample_count} sampel · {formatDate(profile.registered_at)}</p> : <p className="unregistered-copy">Wajah belum didaftarkan</p>}</div><div className="face-card-actions"><button className={`button ${profile ? 'secondary' : 'primary'} small-button`} onClick={() => setSelected(person)}>{profile ? <RefreshCw size={16} /> : <ImagePlus size={16} />}{profile ? 'Daftar ulang' : 'Daftarkan'}</button>{profile && <button className="icon-button delete" title="Hapus profil" onClick={() => setDeleting(person)}><Trash2 size={17} /></button>}</div></article>
          })}</div>
        )}
        {rows.length > pageSize && <div className="table-pagination face-pagination"><span>Menampilkan {start + 1}–{Math.min(start + pageSize, rows.length)} dari {rows.length} {config.label}</span><div className="pagination-controls"><button type="button" aria-label="Halaman sebelumnya" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}><ChevronLeft size={17} /></button><strong>{safePage} / {totalPages}</strong><button type="button" aria-label="Halaman berikutnya" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}><ChevronRight size={17} /></button></div></div>}
      </section>
      {selected && <CaptureModal person={selected} type={type} setToast={setToast} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); load() }} />}
      <ConfirmDialog open={!!deleting} title="Hapus profil wajah?" description={`Template wajah “${deleting?.name}” akan dihapus dan harus didaftarkan kembali sebelum menggunakan absensi wajah.`} busy={busy} onClose={() => setDeleting(null)} onConfirm={removeProfile} />
    </div>
  )
}
