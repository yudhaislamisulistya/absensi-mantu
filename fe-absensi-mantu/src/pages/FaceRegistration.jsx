import { Camera, Check, CheckCircle2, ImagePlus, RefreshCw, ShieldCheck, Trash2, UserRound, VideoOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { detectFace, loadFaceModels, openCamera, stopCamera, videoThumbnail } from '../face'
import { ConfirmDialog, EmptyState, Loading, Modal, PageHeader, SearchBox, formatDate, initials } from '../components/ui'

function CaptureModal({ student, onClose, onSaved, setToast }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [samples, setSamples] = useState([])
  const [photo, setPhoto] = useState('')
  const [message, setMessage] = useState('Menyiapkan model pengenalan wajah...')
  const prompts = ['Hadapkan wajah lurus ke kamera', 'Miringkan wajah sedikit ke kiri', 'Miringkan wajah sedikit ke kanan']

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
    if (!ready || busy || samples.length >= 3) return
    setBusy(true)
    setMessage('Mendeteksi satu wajah...')
    try {
      const result = await detectFace(videoRef.current)
      if (!result) {
        setMessage('Wajah belum terdeteksi. Hadap kamera dan perbaiki pencahayaan.')
        return
      }
      const next = [...samples, Array.from(result.descriptor)]
      setSamples(next)
      if (!photo) setPhoto(videoThumbnail(videoRef.current))
      setMessage(next.length === 3 ? 'Tiga sampel berhasil diambil. Profil siap disimpan.' : `Sampel ${next.length} berhasil. ${prompts[next.length]}`)
    } catch (error) {
      setMessage(`Gagal mengambil sampel: ${error.message}`)
    } finally { setBusy(false) }
  }

  async function save() {
    setBusy(true)
    try {
      await api.upsert('face_profiles', { student_id: student.id, descriptors: samples, photo_data: photo, sample_count: samples.length }, 'student_id')
      setToast({ message: `Wajah ${student.name} berhasil didaftarkan.` })
      onSaved()
    } catch (error) { setToast({ type: 'error', message: error.message }) }
    finally { setBusy(false) }
  }

  return (
    <Modal open title={`Registrasi wajah — ${student.name}`} description="Ambil tiga sudut wajah untuk meningkatkan akurasi pencocokan." size="lg" onClose={onClose}>
      <div className="modal-body capture-layout">
        <div className="camera-frame registration-camera">
          <video ref={videoRef} muted playsInline />
          <div className="face-guide"><i /><i /><i /><i /></div>
          {!ready && <div className="camera-loading"><Camera /><span>{message}</span></div>}
        </div>
        <div className="capture-sidebar">
          <div className="capture-person"><span className="avatar">{initials(student.name)}</span><div><strong>{student.name}</strong><small>NIS {student.nis} · {student.classes?.name || 'Tanpa kelas'}</small></div></div>
          <div className="capture-progress">
            {[0, 1, 2].map((index) => <div className={samples[index] ? 'done' : index === samples.length ? 'current' : ''} key={index}><span>{samples[index] ? <Check size={16} /> : index + 1}</span><div><strong>Sampel {index + 1}</strong><small>{['Posisi lurus', 'Sedikit ke kiri', 'Sedikit ke kanan'][index]}</small></div></div>)}
          </div>
          <div className="capture-message"><ShieldCheck size={17} /><span>{message}</span></div>
          <button className="button secondary full" type="button" disabled={!ready || busy || samples.length >= 3} onClick={capture}><Camera size={18} /> {busy ? 'Mendeteksi...' : samples.length >= 3 ? 'Sampel lengkap' : `Ambil sampel ${samples.length + 1}`}</button>
        </div>
      </div>
      <div className="modal-footer"><button className="button secondary" type="button" onClick={onClose}>Batal</button><button className="button primary" type="button" disabled={samples.length < 3 || busy} onClick={save}><CheckCircle2 size={18} /> Simpan profil wajah</button></div>
    </Modal>
  )
}

export default function FaceRegistration({ setToast }) {
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [studentRows, classRows] = await Promise.all([
        api.get('students?select=id,nis,name,class_id,status,classes(id,name),face_profiles(student_id,sample_count,registered_at,photo_data)&status=eq.active&order=name.asc'),
        api.get('classes?select=id,name,grade&order=grade,name'),
      ])
      setStudents(studentRows)
      setClasses(classRows)
    } catch (error) { setToast({ type: 'error', message: error.message }) }
    finally { setLoading(false) }
  }, [setToast])
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => students.filter((student) => {
    const matchesClass = !classFilter || student.class_id === classFilter
    const matchesSearch = `${student.nis} ${student.name}`.toLowerCase().includes(search.toLowerCase())
    return matchesClass && matchesSearch
  }), [classFilter, search, students])
  const registered = students.filter((student) => student.face_profiles).length

  async function removeProfile() {
    setBusy(true)
    try {
      await api.remove('face_profiles', deleting.id, 'student_id')
      setToast({ message: `Profil wajah ${deleting.name} berhasil dihapus.` })
      setDeleting(null)
      await load()
    } catch (error) { setToast({ type: 'error', message: error.message }) }
    finally { setBusy(false) }
  }

  return (
    <div className="page">
      <PageHeader eyebrow="PENGENALAN WAJAH" title="Registrasi Wajah Siswa" description="Daftarkan tiga sampel wajah setiap siswa agar proses absensi lebih akurat." />
      <section className="face-summary">
        <div><span className="stat-icon teal"><UserRound /></span><p>Total siswa aktif<strong>{students.length}</strong></p></div>
        <div><span className="stat-icon blue"><CheckCircle2 /></span><p>Sudah terdaftar<strong>{registered}</strong></p></div>
        <div><span className="stat-icon amber"><VideoOff /></span><p>Belum terdaftar<strong>{students.length - registered}</strong></p></div>
        <div className="privacy-note"><ShieldCheck /><p><strong>Privasi terjaga</strong><span>Template wajah hanya dapat diakses admin.</span></p></div>
      </section>
      <section className="panel face-panel">
        <div className="table-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Cari nama atau NIS..." /><select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}><option value="">Semua kelas</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        {loading ? <Loading /> : !rows.length ? <EmptyState title="Siswa tidak ditemukan" text="Periksa pencarian atau tambahkan data siswa terlebih dahulu." /> : (
          <div className="face-card-grid">
            {rows.map((student) => {
              const profile = student.face_profiles
              return <article className="face-card" key={student.id}>
                <div className="face-photo">{profile?.photo_data ? <img src={profile.photo_data} alt={`Wajah ${student.name}`} /> : <span>{initials(student.name)}</span>}{profile && <i><Check size={14} /></i>}</div>
                <div className="face-card-copy"><strong>{student.name}</strong><small>NIS {student.nis} · {student.classes?.name || 'Tanpa kelas'}</small>{profile ? <p className="registered-copy"><CheckCircle2 size={15} /> {profile.sample_count} sampel · {formatDate(profile.registered_at)}</p> : <p className="unregistered-copy">Wajah belum didaftarkan</p>}</div>
                <div className="face-card-actions"><button className={`button ${profile ? 'secondary' : 'primary'} small-button`} onClick={() => setSelected(student)}>{profile ? <RefreshCw size={16} /> : <ImagePlus size={16} />}{profile ? 'Daftar ulang' : 'Daftarkan'}</button>{profile && <button className="icon-button delete" title="Hapus profil" onClick={() => setDeleting(student)}><Trash2 size={17} /></button>}</div>
              </article>
            })}
          </div>
        )}
      </section>
      {selected && <CaptureModal student={selected} setToast={setToast} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); load() }} />}
      <ConfirmDialog open={!!deleting} title="Hapus profil wajah?" description={`Template wajah “${deleting?.name}” akan dihapus. Siswa harus didaftarkan kembali sebelum menggunakan absensi wajah.`} busy={busy} onClose={() => setDeleting(null)} onConfirm={removeProfile} />
    </div>
  )
}
