import { Edit3, Plus, Save, Trash2, UserCog } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { ConfirmDialog, DataTable, Field, Modal, PageHeader, SearchBox, StatusBadge, initials } from '../components/ui'

function RowActions({ onEdit, onDelete }) {
  return <div className="row-actions"><button className="icon-button edit" onClick={onEdit} title="Edit"><Edit3 size={17} /></button><button className="icon-button delete" onClick={onDelete} title="Hapus"><Trash2 size={17} /></button></div>
}

function useCrud(table, query, setToast) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await api.get(`${table}?${query}`)) }
    catch (error) { setToast({ type: 'error', message: error.message }) }
    finally { setLoading(false) }
  }, [query, setToast, table])
  useEffect(() => { load() }, [load])

  async function save(id, data) {
    setBusy(true)
    try {
      if (id) await api.update(table, id, data)
      else await api.create(table, data)
      await load()
      setToast({ message: `Data berhasil ${id ? 'diperbarui' : 'ditambahkan'}.` })
      return true
    } catch (error) {
      setToast({ type: 'error', message: error.message })
      return false
    } finally { setBusy(false) }
  }

  async function remove(id) {
    setBusy(true)
    try {
      await api.remove(table, id)
      await load()
      setToast({ message: 'Data berhasil dihapus.' })
      return true
    } catch (error) {
      setToast({ type: 'error', message: error.message.includes('violates foreign key') ? 'Data masih digunakan dan tidak dapat dihapus.' : error.message })
      return false
    } finally { setBusy(false) }
  }
  return { rows, loading, busy, save, remove, load }
}

function CrudLayout({ eyebrow, title, description, search, setSearch, addLabel, onAdd, children }) {
  return <div className="page"><PageHeader eyebrow={eyebrow} title={title} description={description} action={<button className="button primary" onClick={onAdd}><Plus size={18} /> {addLabel}</button>} /><div className="panel table-panel"><div className="table-toolbar"><SearchBox value={search} onChange={setSearch} /></div>{children}</div></div>
}

export function MajorsPage({ setToast }) {
  const crud = useCrud('majors', 'select=*&order=code.asc', setToast)
  const empty = { code: '', name: '', description: '' }
  const [form, setForm] = useState(null)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState(null)
  const rows = crud.rows.filter((row) => `${row.code} ${row.name}`.toLowerCase().includes(search.toLowerCase()))
  async function submit(event) {
    event.preventDefault()
    if (await crud.save(form.id, { code: form.code.trim().toUpperCase(), name: form.name.trim(), description: form.description?.trim() || null })) setForm(null)
  }
  const columns = [
    { key: 'code', label: 'Kode', render: (row) => <span className="code-chip">{row.code}</span> },
    { key: 'name', label: 'Nama Jurusan' },
    { key: 'description', label: 'Keterangan', render: (row) => row.description || '-' },
    { key: 'actions', label: 'Aksi', render: (row) => <RowActions onEdit={() => setForm(row)} onDelete={() => setDeleting(row)} /> },
  ]
  return <CrudLayout eyebrow="DATA MASTER" title="Manajemen Jurusan" description="Kelola program dan konsentrasi keahlian sekolah." search={search} setSearch={setSearch} addLabel="Tambah jurusan" onAdd={() => setForm(empty)}><DataTable columns={columns} rows={rows} loading={crud.loading} emptyTitle="Belum ada jurusan" /><Modal open={!!form} title={`${form?.id ? 'Edit' : 'Tambah'} jurusan`} onClose={() => setForm(null)}><form onSubmit={submit}><div className="modal-body form-grid"><Field label="Kode jurusan" required><input required maxLength="20" value={form?.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Contoh: RPL" /></Field><Field label="Nama jurusan" required><input required value={form?.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rekayasa Perangkat Lunak" /></Field><Field label="Keterangan"><textarea rows="3" value={form?.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div><div className="modal-footer"><button className="button secondary" type="button" onClick={() => setForm(null)}>Batal</button><button className="button primary" disabled={crud.busy}><Save size={17} /> Simpan</button></div></form></Modal><ConfirmDialog open={!!deleting} description={`Jurusan “${deleting?.name}” akan dihapus permanen.`} busy={crud.busy} onClose={() => setDeleting(null)} onConfirm={async () => { if (await crud.remove(deleting.id)) setDeleting(null) }} /></CrudLayout>
}

export function TeachersPage({ setToast }) {
  const crud = useCrud('teachers', 'select=*&order=name.asc', setToast)
  const empty = { nip: '', name: '', gender: 'L', phone: '', email: '', address: '', status: 'active' }
  const [form, setForm] = useState(null)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState(null)
  const rows = crud.rows.filter((row) => `${row.nip} ${row.name} ${row.email}`.toLowerCase().includes(search.toLowerCase()))
  async function submit(event) {
    event.preventDefault()
    const data = { ...form, nip: form.nip.trim(), name: form.name.trim(), phone: form.phone || null, email: form.email || null, address: form.address || null }
    delete data.id; delete data.created_at; delete data.updated_at
    if (await crud.save(form.id, data)) setForm(null)
  }
  const columns = [
    { key: 'name', label: 'Guru', render: (row) => <div className="person-cell"><span className="avatar small">{initials(row.name)}</span><div><strong>{row.name}</strong><small>{row.email || 'Email belum diisi'}</small></div></div> },
    { key: 'nip', label: 'NIP' },
    { key: 'gender', label: 'L/P', render: (row) => row.gender === 'L' ? 'Laki-laki' : 'Perempuan' },
    { key: 'phone', label: 'Telepon', render: (row) => row.phone || '-' },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'actions', label: 'Aksi', render: (row) => <RowActions onEdit={() => setForm(row)} onDelete={() => setDeleting(row)} /> },
  ]
  return <CrudLayout eyebrow="DATA MASTER" title="Manajemen Guru" description="Simpan identitas dan status tenaga pengajar." search={search} setSearch={setSearch} addLabel="Tambah guru" onAdd={() => setForm(empty)}><DataTable columns={columns} rows={rows} loading={crud.loading} emptyTitle="Belum ada guru" /><Modal open={!!form} title={`${form?.id ? 'Edit' : 'Tambah'} data guru`} size="lg" onClose={() => setForm(null)}><form onSubmit={submit}><div className="modal-body form-grid two"><Field label="NIP" required><input required value={form?.nip || ''} onChange={(e) => setForm({ ...form, nip: e.target.value })} /></Field><Field label="Nama lengkap" required><input required value={form?.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="Jenis kelamin" required><select value={form?.gender || 'L'} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></Field><Field label="Status"><select value={form?.status || 'active'} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></Field><Field label="Nomor telepon"><input value={form?.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field><Field label="Email"><input type="email" value={form?.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field><Field label="Alamat"><textarea rows="3" value={form?.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field></div><div className="modal-footer"><button className="button secondary" type="button" onClick={() => setForm(null)}>Batal</button><button className="button primary" disabled={crud.busy}><Save size={17} /> Simpan</button></div></form></Modal><ConfirmDialog open={!!deleting} description={`Data guru “${deleting?.name}” akan dihapus.`} busy={crud.busy} onClose={() => setDeleting(null)} onConfirm={async () => { if (await crud.remove(deleting.id)) setDeleting(null) }} /></CrudLayout>
}

export function ClassesPage({ setToast }) {
  const crud = useCrud('classes', 'select=*,majors(id,code,name),teachers(id,nip,name)&order=grade.asc,name.asc', setToast)
  const [majors, setMajors] = useState([])
  const [teachers, setTeachers] = useState([])
  const [form, setForm] = useState(null)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState(null)
  useEffect(() => { Promise.all([api.get('majors?select=id,code,name&order=code'), api.get('teachers?select=id,nip,name&status=eq.active&order=name')]).then(([m, t]) => { setMajors(m); setTeachers(t) }) }, [])
  const rows = crud.rows.filter((row) => `${row.name} ${row.majors?.name || ''} ${row.teachers?.name || ''}`.toLowerCase().includes(search.toLowerCase()))
  async function submit(event) {
    event.preventDefault()
    const data = { name: form.name.trim(), grade: Number(form.grade), academic_year: form.academic_year.trim(), room: form.room || null, major_id: form.major_id || null, homeroom_teacher_id: form.homeroom_teacher_id || null }
    if (await crud.save(form.id, data)) setForm(null)
  }
  const columns = [
    { key: 'name', label: 'Kelas', render: (row) => <div><strong>{row.name}</strong><small className="block">Tingkat {row.grade}</small></div> },
    { key: 'major', label: 'Jurusan', render: (row) => row.majors ? <span className="code-chip">{row.majors.code}</span> : '-' },
    { key: 'academic_year', label: 'Tahun Ajaran' },
    { key: 'room', label: 'Ruang', render: (row) => row.room || '-' },
    { key: 'homeroom', label: 'Guru Wali', render: (row) => row.teachers?.name || <span className="muted">Belum ditentukan</span> },
    { key: 'actions', label: 'Aksi', render: (row) => <RowActions onEdit={() => setForm({ ...row, major_id: row.major_id || '', homeroom_teacher_id: row.homeroom_teacher_id || '' })} onDelete={() => setDeleting(row)} /> },
  ]
  const empty = { name: '', grade: '10', academic_year: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`, room: '', major_id: '', homeroom_teacher_id: '' }
  return <CrudLayout eyebrow="DATA MASTER" title="Manajemen Kelas" description="Kelola rombongan belajar, jurusan, dan guru wali." search={search} setSearch={setSearch} addLabel="Tambah kelas" onAdd={() => setForm(empty)}><DataTable columns={columns} rows={rows} loading={crud.loading} emptyTitle="Belum ada kelas" /><Modal open={!!form} title={`${form?.id ? 'Edit' : 'Tambah'} kelas`} size="lg" onClose={() => setForm(null)}><form onSubmit={submit}><div className="modal-body form-grid two"><Field label="Nama kelas" required><input required value={form?.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contoh: X RPL 1" /></Field><Field label="Tingkat" required><select value={form?.grade || '10'} onChange={(e) => setForm({ ...form, grade: e.target.value })}>{Array.from({ length: 12 }, (_, i) => i + 1).map((grade) => <option key={grade}>{grade}</option>)}</select></Field><Field label="Jurusan"><select value={form?.major_id || ''} onChange={(e) => setForm({ ...form, major_id: e.target.value })}><option value="">Tanpa jurusan</option>{majors.map((major) => <option key={major.id} value={major.id}>{major.code} — {major.name}</option>)}</select></Field><Field label="Tahun ajaran" required><input required value={form?.academic_year || ''} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} /></Field><Field label="Ruang"><input value={form?.room || ''} onChange={(e) => setForm({ ...form, room: e.target.value })} /></Field><Field label="Guru wali"><select value={form?.homeroom_teacher_id || ''} onChange={(e) => setForm({ ...form, homeroom_teacher_id: e.target.value })}><option value="">Belum ditentukan</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name} — {teacher.nip}</option>)}</select></Field></div><div className="modal-footer"><button className="button secondary" type="button" onClick={() => setForm(null)}>Batal</button><button className="button primary" disabled={crud.busy}><Save size={17} /> Simpan</button></div></form></Modal><ConfirmDialog open={!!deleting} description={`Kelas “${deleting?.name}” akan dihapus. Pastikan tidak ada siswa atau absensi yang masih terhubung.`} busy={crud.busy} onClose={() => setDeleting(null)} onConfirm={async () => { if (await crud.remove(deleting.id)) setDeleting(null) }} /></CrudLayout>
}

export function StudentsPage({ setToast }) {
  const crud = useCrud('students', 'select=*,classes(id,name,grade)&order=name.asc', setToast)
  const [classes, setClasses] = useState([])
  const [form, setForm] = useState(null)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [deleting, setDeleting] = useState(null)
  useEffect(() => { api.get('classes?select=id,name,grade&order=grade,name').then(setClasses) }, [])
  const rows = crud.rows.filter((row) => (!classFilter || row.class_id === classFilter) && `${row.nis} ${row.nisn || ''} ${row.name}`.toLowerCase().includes(search.toLowerCase()))
  async function submit(event) {
    event.preventDefault()
    const data = { nis: form.nis.trim(), nisn: form.nisn?.trim() || null, name: form.name.trim(), gender: form.gender, birth_place: form.birth_place || null, birth_date: form.birth_date || null, address: form.address || null, phone: form.phone || null, parent_phone: form.parent_phone || null, class_id: form.class_id || null, status: form.status }
    if (await crud.save(form.id, data)) setForm(null)
  }
  const columns = [
    { key: 'name', label: 'Siswa', render: (row) => <div className="person-cell"><span className="avatar small student">{initials(row.name)}</span><div><strong>{row.name}</strong><small>NIS {row.nis}</small></div></div> },
    { key: 'nisn', label: 'NISN', render: (row) => row.nisn || '-' },
    { key: 'class', label: 'Kelas', render: (row) => row.classes?.name || <span className="muted">Belum ada kelas</span> },
    { key: 'gender', label: 'L/P', render: (row) => row.gender === 'L' ? 'Laki-laki' : 'Perempuan' },
    { key: 'parent_phone', label: 'Kontak Wali', render: (row) => row.parent_phone || '-' },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'actions', label: 'Aksi', render: (row) => <RowActions onEdit={() => setForm(row)} onDelete={() => setDeleting(row)} /> },
  ]
  const empty = { nis: '', nisn: '', name: '', gender: 'L', birth_place: '', birth_date: '', address: '', phone: '', parent_phone: '', class_id: '', status: 'active' }
  return <CrudLayout eyebrow="DATA MASTER" title="Manajemen Siswa" description="Kelola identitas, kelas, dan status seluruh siswa." search={search} setSearch={setSearch} addLabel="Tambah siswa" onAdd={() => setForm(empty)}><div className="filter-row"><select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}><option value="">Semua kelas</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span>{rows.length} siswa</span></div><DataTable columns={columns} rows={rows} loading={crud.loading} emptyTitle="Belum ada siswa" /><Modal open={!!form} title={`${form?.id ? 'Edit' : 'Tambah'} data siswa`} size="lg" onClose={() => setForm(null)}><form onSubmit={submit}><div className="modal-body form-grid two"><Field label="NIS" required><input required value={form?.nis || ''} onChange={(e) => setForm({ ...form, nis: e.target.value })} /></Field><Field label="NISN"><input value={form?.nisn || ''} onChange={(e) => setForm({ ...form, nisn: e.target.value })} /></Field><Field label="Nama lengkap" required><input required value={form?.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="Jenis kelamin" required><select value={form?.gender || 'L'} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></Field><Field label="Kelas"><select value={form?.class_id || ''} onChange={(e) => setForm({ ...form, class_id: e.target.value })}><option value="">Belum ada kelas</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Status"><select value={form?.status || 'active'} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="graduated">Lulus</option></select></Field><Field label="Tempat lahir"><input value={form?.birth_place || ''} onChange={(e) => setForm({ ...form, birth_place: e.target.value })} /></Field><Field label="Tanggal lahir"><input type="date" value={form?.birth_date || ''} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></Field><Field label="Telepon siswa"><input value={form?.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field><Field label="Telepon wali"><input value={form?.parent_phone || ''} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} /></Field><Field label="Alamat"><textarea rows="3" value={form?.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field></div><div className="modal-footer"><button className="button secondary" type="button" onClick={() => setForm(null)}>Batal</button><button className="button primary" disabled={crud.busy}><Save size={17} /> Simpan</button></div></form></Modal><ConfirmDialog open={!!deleting} description={`Siswa “${deleting?.name}” dan profil wajahnya akan dihapus. Riwayat absensi yang sudah ada harus dipertahankan.`} busy={crud.busy} onClose={() => setDeleting(null)} onConfirm={async () => { if (await crud.remove(deleting.id)) setDeleting(null) }} /></CrudLayout>
}

export function HomeroomPage({ setToast }) {
  const [classes, setClasses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  useEffect(() => { Promise.all([api.get('classes?select=*,majors(code,name),teachers(id,nip,name)&order=grade,name'), api.get('teachers?select=id,nip,name&status=eq.active&order=name')]).then(([c, t]) => { setClasses(c); setTeachers(t) }).finally(() => setLoading(false)) }, [])
  async function assign(item, teacherId) {
    setBusyId(item.id)
    try {
      await api.update('classes', item.id, { homeroom_teacher_id: teacherId || null })
      const teacher = teachers.find((row) => row.id === teacherId) || null
      setClasses((current) => current.map((row) => row.id === item.id ? { ...row, homeroom_teacher_id: teacherId || null, teachers: teacher } : row))
      setToast({ message: `Guru wali ${item.name} berhasil diperbarui.` })
    } catch (error) { setToast({ type: 'error', message: error.message }) }
    finally { setBusyId('') }
  }
  const columns = [
    { key: 'class', label: 'Kelas', render: (row) => <div><strong>{row.name}</strong><small className="block">{row.majors?.name || 'Umum'} · {row.academic_year}</small></div> },
    { key: 'teacher', label: 'Guru Wali Saat Ini', render: (row) => row.teachers ? <div className="person-cell"><span className="avatar small teacher"><UserCog size={16} /></span><div><strong>{row.teachers.name}</strong><small>NIP {row.teachers.nip}</small></div></div> : <span className="muted">Belum ditentukan</span> },
    { key: 'assignment', label: 'Penugasan', render: (row) => <select className="inline-select" value={row.homeroom_teacher_id || ''} disabled={busyId === row.id} onChange={(e) => assign(row, e.target.value)}><option value="">Pilih guru wali</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select> },
  ]
  return <div className="page"><PageHeader eyebrow="DATA MASTER" title="Manajemen Guru Wali" description="Tetapkan guru wali untuk setiap kelas dan tahun ajaran." /><div className="info-banner"><UserCog /><div><strong>Satu langkah untuk penugasan</strong><p>Pilih nama guru pada kolom penugasan. Perubahan tersimpan secara otomatis.</p></div></div><div className="panel table-panel"><DataTable columns={columns} rows={classes} loading={loading} emptyTitle="Belum ada kelas" emptyText="Tambahkan kelas sebelum menetapkan guru wali." /></div></div>
}
