import { Edit3, Plus, Save, Trash2, Upload, UserCog } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import ExcelImport from '../components/ExcelImport'
import { ConfirmDialog, DataTable, Field, Modal, PageHeader, SearchBox, StatusBadge, initials } from '../components/ui'

const excelColumns = {
  majors: [
    { key: 'code', label: 'Kode Jurusan', required: true, example: 'RPL', width: 18 },
    { key: 'name', label: 'Nama Jurusan', required: true, example: 'Rekayasa Perangkat Lunak', width: 34 },
    { key: 'description', label: 'Keterangan', example: 'Pengembangan perangkat lunak', width: 40 },
  ],
  teachers: [
    { key: 'nip', label: 'NIP', required: true, example: '198501012010011001', width: 24 },
    { key: 'name', label: 'Nama', required: true, example: 'Budi Santoso, S.Pd.', width: 30 },
    { key: 'gender', label: 'Jenis Kelamin', required: true, example: 'L', width: 18 },
    { key: 'phone', label: 'Telepon', example: '081234567890', width: 20 },
    { key: 'email', label: 'Email', example: 'budi@sekolah.id', width: 28 },
    { key: 'address', label: 'Alamat', example: 'Jl. Pendidikan No. 1', width: 35 },
    { key: 'status', label: 'Status', example: 'active', width: 16 },
  ],
  classes: [
    { key: 'name', label: 'Nama Kelas', required: true, example: 'X RPL 1', width: 20 },
    { key: 'grade', label: 'Tingkat', required: true, example: 10, width: 12 },
    { key: 'major_code', label: 'Kode Jurusan', example: 'RPL', width: 18 },
    { key: 'academic_year', label: 'Tahun Ajaran', required: true, example: '2026/2027', width: 18 },
    { key: 'room', label: 'Ruang', example: 'Lab RPL 1', width: 20 },
    { key: 'teacher_nip', label: 'NIP Guru Wali', example: '198501012010011001', width: 24 },
  ],
  students: [
    { key: 'nis', label: 'NIS', required: true, example: '2026001', width: 18 },
    { key: 'nisn', label: 'NISN', example: '0098765432', width: 18 },
    { key: 'name', label: 'Nama', required: true, example: 'Andi Pratama', width: 28 },
    { key: 'gender', label: 'Jenis Kelamin', required: true, example: 'L', width: 18 },
    { key: 'class_name', label: 'Kelas', required: true, example: 'X RPL 1', width: 20 },
    { key: 'birth_place', label: 'Tempat Lahir', example: 'Bandung', width: 20 },
    { key: 'birth_date', label: 'Tanggal Lahir', example: '2010-05-17', width: 18 },
    { key: 'phone', label: 'Telepon', example: '081234567890', width: 20 },
    { key: 'parent_phone', label: 'Telepon Wali', example: '081298765432', width: 20 },
    { key: 'address', label: 'Alamat', example: 'Jl. Pendidikan No. 2', width: 35 },
    { key: 'status', label: 'Status', example: 'active', width: 16 },
  ],
  homeroom: [
    { key: 'class_name', label: 'Nama Kelas', required: true, example: 'X RPL 1', width: 22 },
    { key: 'teacher_nip', label: 'NIP Guru Wali', required: true, example: '198501012010011001', width: 26 },
  ],
}

function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value).toLowerCase()
}

function nullable(value) {
  return text(value) || null
}

function gender(value, rowNumber) {
  const normalized = key(value).replaceAll(' ', '').replace('-', '')
  if (['l', 'lakilaki'].includes(normalized)) return 'L'
  if (['p', 'perempuan'].includes(normalized)) return 'P'
  throw new Error(`Baris ${rowNumber}: Jenis Kelamin harus L atau P.`)
}

function status(value, rowNumber, student = false) {
  const aliases = { active: 'active', aktif: 'active', inactive: 'inactive', nonaktif: 'inactive', graduated: 'graduated', lulus: 'graduated' }
  const result = aliases[key(value) || 'active']
  if (!result || (!student && result === 'graduated')) throw new Error(`Baris ${rowNumber}: Status tidak valid.`)
  return result
}

function date(value, rowNumber) {
  if (!value) return null
  const result = value instanceof Date ? value.toISOString().slice(0, 10) : text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(new Date(`${result}T00:00:00`).getTime())) {
    throw new Error(`Baris ${rowNumber}: Tanggal Lahir harus berformat YYYY-MM-DD.`)
  }
  return result
}

function unique(rows, property, label) {
  const found = new Set()
  rows.forEach((row, index) => {
    const value = key(row[property])
    if (found.has(value)) throw new Error(`Baris ${index + 2}: ${label} “${row[property]}” duplikat di dalam file.`)
    found.add(value)
  })
}

function reference(map, value, label, rowNumber, required = false) {
  if (!text(value) && !required) return null
  const result = map.get(key(value))
  if (!result) throw new Error(`Baris ${rowNumber}: ${label} “${text(value)}” tidak ditemukan.`)
  return result
}

function RowActions({ onEdit, onDelete }) {
  return <div className="row-actions"><button className="icon-button edit" type="button" onClick={onEdit} title="Edit"><Edit3 size={17} /></button><button className="icon-button delete" type="button" onClick={onDelete} title="Hapus"><Trash2 size={17} /></button></div>
}

function useCrud(table, query, setToast) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await api.get(`${table}?${query}`))
    } catch (error) {
      setToast({ type: 'error', message: error.message })
    } finally {
      setLoading(false)
    }
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
    } finally {
      setBusy(false)
    }
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
    } finally {
      setBusy(false)
    }
  }
  return { rows, loading, busy, save, remove, load }
}

function CrudLayout({ eyebrow, title, description, search, setSearch, addLabel, onAdd, onImport, children }) {
  const action = <><button className="button secondary" type="button" onClick={onImport}><Upload size={18} /> Import Excel</button><button className="button primary" type="button" onClick={onAdd}><Plus size={18} /> {addLabel}</button></>
  return <div className="page"><PageHeader eyebrow={eyebrow} title={title} description={description} action={action} /><div className="panel table-panel"><div className="table-toolbar"><SearchBox value={search} onChange={setSearch} /></div>{children}</div></div>
}

export function MajorsPage({ setToast }) {
  const crud = useCrud('majors', 'select=*&order=code.asc', setToast)
  const empty = { code: '', name: '', description: '' }
  const [form, setForm] = useState(null)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const rows = crud.rows.filter((row) => `${row.code} ${row.name}`.toLowerCase().includes(search.toLowerCase()))

  async function submit(event) {
    event.preventDefault()
    if (await crud.save(form.id, { code: form.code.trim().toUpperCase(), name: form.name.trim(), description: form.description?.trim() || null })) setForm(null)
  }

  async function importRows(imported) {
    unique(imported, 'code', 'Kode Jurusan')
    const payload = imported.map((row) => ({ code: text(row.code).toUpperCase(), name: text(row.name), description: nullable(row.description) }))
    await api.bulkUpsert('majors', payload, 'code')
    await crud.load()
    setToast({ message: `${payload.length} data jurusan berhasil diimpor.` })
  }

  const columns = [
    { key: 'code', label: 'Kode', render: (row) => <span className="code-chip">{row.code}</span> },
    { key: 'name', label: 'Nama Jurusan' },
    { key: 'description', label: 'Keterangan', render: (row) => row.description || '-' },
    { key: 'actions', label: 'Aksi', render: (row) => <RowActions onEdit={() => setForm(row)} onDelete={() => setDeleting(row)} /> },
  ]

  return (
    <CrudLayout eyebrow="DATA MASTER" title="Manajemen Jurusan" description="Kelola program dan konsentrasi keahlian sekolah." search={search} setSearch={setSearch} addLabel="Tambah jurusan" onAdd={() => setForm(empty)} onImport={() => setImportOpen(true)}>
      <DataTable columns={columns} rows={rows} loading={crud.loading} emptyTitle="Belum ada jurusan" />
      <ExcelImport open={importOpen} title="Data Jurusan" fileName="template-import-jurusan.xlsx" columns={excelColumns.majors} onClose={() => setImportOpen(false)} onImport={importRows} />
      <Modal open={!!form} title={`${form?.id ? 'Edit' : 'Tambah'} jurusan`} onClose={() => setForm(null)}><form onSubmit={submit}><div className="modal-body form-grid"><Field label="Kode jurusan" required><input required maxLength="20" value={form?.code || ''} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="Contoh: RPL" /></Field><Field label="Nama jurusan" required><input required value={form?.name || ''} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Rekayasa Perangkat Lunak" /></Field><Field label="Keterangan"><textarea rows="3" value={form?.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field></div><div className="modal-footer"><button className="button secondary" type="button" onClick={() => setForm(null)}>Batal</button><button className="button primary" disabled={crud.busy}><Save size={17} /> Simpan</button></div></form></Modal>
      <ConfirmDialog open={!!deleting} description={`Jurusan “${deleting?.name}” akan dihapus permanen.`} busy={crud.busy} onClose={() => setDeleting(null)} onConfirm={async () => { if (await crud.remove(deleting.id)) setDeleting(null) }} />
    </CrudLayout>
  )
}

export function TeachersPage({ setToast }) {
  const crud = useCrud('teachers', 'select=*&order=name.asc', setToast)
  const empty = { nip: '', name: '', gender: 'L', phone: '', email: '', address: '', status: 'active' }
  const [form, setForm] = useState(null)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const rows = crud.rows.filter((row) => `${row.nip} ${row.name} ${row.email}`.toLowerCase().includes(search.toLowerCase()))

  async function submit(event) {
    event.preventDefault()
    const data = { ...form, nip: form.nip.trim(), name: form.name.trim(), phone: form.phone || null, email: form.email || null, address: form.address || null }
    delete data.id; delete data.created_at; delete data.updated_at
    if (await crud.save(form.id, data)) setForm(null)
  }

  async function importRows(imported) {
    unique(imported, 'nip', 'NIP')
    const payload = imported.map((row, index) => ({
      nip: text(row.nip), name: text(row.name), gender: gender(row.gender, index + 2), phone: nullable(row.phone),
      email: nullable(row.email), address: nullable(row.address), status: status(row.status, index + 2),
    }))
    await api.bulkUpsert('teachers', payload, 'nip')
    await crud.load()
    setToast({ message: `${payload.length} data guru berhasil diimpor.` })
  }

  const columns = [
    { key: 'name', label: 'Guru', render: (row) => <div className="person-cell"><span className="avatar small">{initials(row.name)}</span><div><strong>{row.name}</strong><small>{row.email || 'Email belum diisi'}</small></div></div> },
    { key: 'nip', label: 'NIP' },
    { key: 'gender', label: 'L/P', render: (row) => row.gender === 'L' ? 'Laki-laki' : 'Perempuan' },
    { key: 'phone', label: 'Telepon', render: (row) => row.phone || '-' },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'actions', label: 'Aksi', render: (row) => <RowActions onEdit={() => setForm(row)} onDelete={() => setDeleting(row)} /> },
  ]

  return (
    <CrudLayout eyebrow="DATA MASTER" title="Manajemen Guru" description="Simpan identitas dan status tenaga pengajar." search={search} setSearch={setSearch} addLabel="Tambah guru" onAdd={() => setForm(empty)} onImport={() => setImportOpen(true)}>
      <DataTable columns={columns} rows={rows} loading={crud.loading} emptyTitle="Belum ada guru" />
      <ExcelImport open={importOpen} title="Data Guru" fileName="template-import-guru.xlsx" columns={excelColumns.teachers} onClose={() => setImportOpen(false)} onImport={importRows} />
      <Modal open={!!form} title={`${form?.id ? 'Edit' : 'Tambah'} data guru`} size="lg" onClose={() => setForm(null)}><form onSubmit={submit}><div className="modal-body form-grid two"><Field label="NIP" required><input required value={form?.nip || ''} onChange={(event) => setForm({ ...form, nip: event.target.value })} /></Field><Field label="Nama lengkap" required><input required value={form?.name || ''} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label="Jenis kelamin" required><select value={form?.gender || 'L'} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></Field><Field label="Status"><select value={form?.status || 'active'} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></Field><Field label="Nomor telepon"><input value={form?.phone || ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field><Field label="Email"><input type="email" value={form?.email || ''} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field><Field label="Alamat"><textarea rows="3" value={form?.address || ''} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field></div><div className="modal-footer"><button className="button secondary" type="button" onClick={() => setForm(null)}>Batal</button><button className="button primary" disabled={crud.busy}><Save size={17} /> Simpan</button></div></form></Modal>
      <ConfirmDialog open={!!deleting} description={`Data guru “${deleting?.name}” akan dihapus.`} busy={crud.busy} onClose={() => setDeleting(null)} onConfirm={async () => { if (await crud.remove(deleting.id)) setDeleting(null) }} />
    </CrudLayout>
  )
}

export function ClassesPage({ setToast }) {
  const crud = useCrud('classes', 'select=*,majors(id,code,name),teachers(id,nip,name)&order=grade.asc,name.asc', setToast)
  const [majors, setMajors] = useState([])
  const [teachers, setTeachers] = useState([])
  const [form, setForm] = useState(null)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  useEffect(() => { Promise.all([api.get('majors?select=id,code,name&order=code'), api.get('teachers?select=id,nip,name&status=eq.active&order=name')]).then(([majorRows, teacherRows]) => { setMajors(majorRows); setTeachers(teacherRows) }) }, [])
  const rows = crud.rows.filter((row) => `${row.name} ${row.majors?.name || ''} ${row.teachers?.name || ''}`.toLowerCase().includes(search.toLowerCase()))
  const empty = { name: '', grade: '10', academic_year: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`, room: '', major_id: '', homeroom_teacher_id: '' }

  async function submit(event) {
    event.preventDefault()
    const data = { name: form.name.trim(), grade: Number(form.grade), academic_year: form.academic_year.trim(), room: form.room || null, major_id: form.major_id || null, homeroom_teacher_id: form.homeroom_teacher_id || null }
    if (await crud.save(form.id, data)) setForm(null)
  }

  async function importRows(imported) {
    unique(imported, 'name', 'Nama Kelas')
    const majorMap = new Map(majors.map((item) => [key(item.code), item.id]))
    const teacherMap = new Map(teachers.map((item) => [key(item.nip), item.id]))
    const payload = imported.map((row, index) => {
      const grade = Number(row.grade)
      if (!Number.isInteger(grade) || grade < 1 || grade > 12) throw new Error(`Baris ${index + 2}: Tingkat harus berupa angka 1–12.`)
      return {
        name: text(row.name), grade, academic_year: text(row.academic_year), room: nullable(row.room),
        major_id: reference(majorMap, row.major_code, 'Kode Jurusan', index + 2),
        homeroom_teacher_id: reference(teacherMap, row.teacher_nip, 'NIP Guru Wali aktif', index + 2),
      }
    })
    await api.bulkUpsert('classes', payload, 'name')
    await crud.load()
    setToast({ message: `${payload.length} data kelas berhasil diimpor.` })
  }

  const columns = [
    { key: 'name', label: 'Kelas', render: (row) => <div><strong>{row.name}</strong><small className="block">Tingkat {row.grade}</small></div> },
    { key: 'major', label: 'Jurusan', render: (row) => row.majors ? <span className="code-chip">{row.majors.code}</span> : '-' },
    { key: 'academic_year', label: 'Tahun Ajaran' },
    { key: 'room', label: 'Ruang', render: (row) => row.room || '-' },
    { key: 'homeroom', label: 'Guru Wali', render: (row) => row.teachers?.name || <span className="muted">Belum ditentukan</span> },
    { key: 'actions', label: 'Aksi', render: (row) => <RowActions onEdit={() => setForm({ ...row, major_id: row.major_id || '', homeroom_teacher_id: row.homeroom_teacher_id || '' })} onDelete={() => setDeleting(row)} /> },
  ]

  return (
    <CrudLayout eyebrow="DATA MASTER" title="Manajemen Kelas" description="Kelola rombongan belajar, jurusan, dan guru wali." search={search} setSearch={setSearch} addLabel="Tambah kelas" onAdd={() => setForm(empty)} onImport={() => setImportOpen(true)}>
      <DataTable columns={columns} rows={rows} loading={crud.loading} emptyTitle="Belum ada kelas" />
      <ExcelImport open={importOpen} title="Data Kelas" fileName="template-import-kelas.xlsx" columns={excelColumns.classes} onClose={() => setImportOpen(false)} onImport={importRows} />
      <Modal open={!!form} title={`${form?.id ? 'Edit' : 'Tambah'} kelas`} size="lg" onClose={() => setForm(null)}><form onSubmit={submit}><div className="modal-body form-grid two"><Field label="Nama kelas" required><input required value={form?.name || ''} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Contoh: X RPL 1" /></Field><Field label="Tingkat" required><select value={form?.grade || '10'} onChange={(event) => setForm({ ...form, grade: event.target.value })}>{Array.from({ length: 12 }, (_, index) => index + 1).map((grade) => <option key={grade}>{grade}</option>)}</select></Field><Field label="Jurusan"><select value={form?.major_id || ''} onChange={(event) => setForm({ ...form, major_id: event.target.value })}><option value="">Tanpa jurusan</option>{majors.map((major) => <option key={major.id} value={major.id}>{major.code} — {major.name}</option>)}</select></Field><Field label="Tahun ajaran" required><input required value={form?.academic_year || ''} onChange={(event) => setForm({ ...form, academic_year: event.target.value })} /></Field><Field label="Ruang"><input value={form?.room || ''} onChange={(event) => setForm({ ...form, room: event.target.value })} /></Field><Field label="Guru wali"><select value={form?.homeroom_teacher_id || ''} onChange={(event) => setForm({ ...form, homeroom_teacher_id: event.target.value })}><option value="">Belum ditentukan</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name} — {teacher.nip}</option>)}</select></Field></div><div className="modal-footer"><button className="button secondary" type="button" onClick={() => setForm(null)}>Batal</button><button className="button primary" disabled={crud.busy}><Save size={17} /> Simpan</button></div></form></Modal>
      <ConfirmDialog open={!!deleting} description={`Kelas “${deleting?.name}” akan dihapus. Pastikan tidak ada siswa atau absensi yang masih terhubung.`} busy={crud.busy} onClose={() => setDeleting(null)} onConfirm={async () => { if (await crud.remove(deleting.id)) setDeleting(null) }} />
    </CrudLayout>
  )
}

export function StudentsPage({ setToast }) {
  const crud = useCrud('students', 'select=*,classes(id,name,grade)&order=name.asc', setToast)
  const [classes, setClasses] = useState([])
  const [form, setForm] = useState(null)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  useEffect(() => { api.get('classes?select=id,name,grade&order=grade,name').then(setClasses) }, [])
  const rows = crud.rows
    .filter((row) => (!classFilter || row.class_id === classFilter) && `${row.nis} ${row.nisn || ''} ${row.name}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.classes?.name || 'ZZZ').localeCompare(b.classes?.name || 'ZZZ') || a.name.localeCompare(b.name))
  const classCounts = new Map(classes.map((item) => [item.id, crud.rows.filter((student) => student.class_id === item.id).length]))
  const empty = { nis: '', nisn: '', name: '', gender: 'L', birth_place: '', birth_date: '', address: '', phone: '', parent_phone: '', class_id: '', status: 'active' }

  async function submit(event) {
    event.preventDefault()
    const data = { nis: form.nis.trim(), nisn: form.nisn?.trim() || null, name: form.name.trim(), gender: form.gender, birth_place: form.birth_place || null, birth_date: form.birth_date || null, address: form.address || null, phone: form.phone || null, parent_phone: form.parent_phone || null, class_id: form.class_id || null, status: form.status }
    if (await crud.save(form.id, data)) setForm(null)
  }

  async function importRows(imported) {
    unique(imported, 'nis', 'NIS')
    const classMap = new Map(classes.map((item) => [key(item.name), item.id]))
    const payload = imported.map((row, index) => ({
      nis: text(row.nis), nisn: nullable(row.nisn), name: text(row.name), gender: gender(row.gender, index + 2),
      class_id: reference(classMap, row.class_name, 'Kelas', index + 2, true), birth_place: nullable(row.birth_place),
      birth_date: date(row.birth_date, index + 2), phone: nullable(row.phone), parent_phone: nullable(row.parent_phone),
      address: nullable(row.address), status: status(row.status, index + 2, true),
    }))
    await api.bulkUpsert('students', payload, 'nis')
    await crud.load()
    setToast({ message: `${payload.length} data siswa berhasil diimpor.` })
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

  return (
    <CrudLayout eyebrow="DATA MASTER" title="Manajemen Siswa" description="Kelola identitas, kelas, dan status seluruh siswa." search={search} setSearch={setSearch} addLabel="Tambah siswa" onAdd={() => setForm(empty)} onImport={() => setImportOpen(true)}>
      <div className="student-class-filter"><div><strong>Tampilkan siswa per kelas</strong><span>{rows.length} siswa ditampilkan</span></div><div className="student-class-tabs"><button type="button" className={!classFilter ? 'active' : ''} onClick={() => setClassFilter('')}>Semua kelas <b>{crud.rows.length}</b></button>{classes.map((item) => <button type="button" key={item.id} className={classFilter === item.id ? 'active' : ''} onClick={() => setClassFilter(item.id)}>{item.name} <b>{classCounts.get(item.id) || 0}</b></button>)}</div></div>
      <DataTable columns={columns} rows={rows} loading={crud.loading} emptyTitle="Belum ada siswa" />
      <ExcelImport open={importOpen} title="Data Siswa" fileName="template-import-siswa.xlsx" columns={excelColumns.students} onClose={() => setImportOpen(false)} onImport={importRows} />
      <Modal open={!!form} title={`${form?.id ? 'Edit' : 'Tambah'} data siswa`} size="lg" onClose={() => setForm(null)}><form onSubmit={submit}><div className="modal-body form-grid two"><Field label="NIS" required><input required value={form?.nis || ''} onChange={(event) => setForm({ ...form, nis: event.target.value })} /></Field><Field label="NISN"><input value={form?.nisn || ''} onChange={(event) => setForm({ ...form, nisn: event.target.value })} /></Field><Field label="Nama lengkap" required><input required value={form?.name || ''} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label="Jenis kelamin" required><select value={form?.gender || 'L'} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></Field><Field label="Kelas"><select value={form?.class_id || ''} onChange={(event) => setForm({ ...form, class_id: event.target.value })}><option value="">Belum ada kelas</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Status"><select value={form?.status || 'active'} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="graduated">Lulus</option></select></Field><Field label="Tempat lahir"><input value={form?.birth_place || ''} onChange={(event) => setForm({ ...form, birth_place: event.target.value })} /></Field><Field label="Tanggal lahir"><input type="date" value={form?.birth_date || ''} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} /></Field><Field label="Telepon siswa"><input value={form?.phone || ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field><Field label="Telepon wali"><input value={form?.parent_phone || ''} onChange={(event) => setForm({ ...form, parent_phone: event.target.value })} /></Field><Field label="Alamat"><textarea rows="3" value={form?.address || ''} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field></div><div className="modal-footer"><button className="button secondary" type="button" onClick={() => setForm(null)}>Batal</button><button className="button primary" disabled={crud.busy}><Save size={17} /> Simpan</button></div></form></Modal>
      <ConfirmDialog open={!!deleting} description={`Siswa “${deleting?.name}” dan profil wajahnya akan dihapus. Riwayat absensi yang sudah ada harus dipertahankan.`} busy={crud.busy} onClose={() => setDeleting(null)} onConfirm={async () => { if (await crud.remove(deleting.id)) setDeleting(null) }} />
    </CrudLayout>
  )
}

export function HomeroomPage({ setToast }) {
  const [classes, setClasses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [classRows, teacherRows] = await Promise.all([
        api.get('classes?select=*,majors(code,name),teachers(id,nip,name)&order=grade,name'),
        api.get('teachers?select=id,nip,name&status=eq.active&order=name'),
      ])
      setClasses(classRows)
      setTeachers(teacherRows)
    } catch (error) {
      setToast({ type: 'error', message: error.message })
    } finally {
      setLoading(false)
    }
  }, [setToast])
  useEffect(() => { load() }, [load])

  async function assign(item, teacherId) {
    setBusyId(item.id)
    try {
      await api.update('classes', item.id, { homeroom_teacher_id: teacherId || null })
      const teacher = teachers.find((row) => row.id === teacherId) || null
      setClasses((current) => current.map((row) => row.id === item.id ? { ...row, homeroom_teacher_id: teacherId || null, teachers: teacher } : row))
      setToast({ message: `Guru wali ${item.name} berhasil diperbarui.` })
    } catch (error) {
      setToast({ type: 'error', message: error.message })
    } finally {
      setBusyId('')
    }
  }

  async function importRows(imported) {
    unique(imported, 'class_name', 'Nama Kelas')
    const classMap = new Map(classes.map((item) => [key(item.name), item.id]))
    const teacherMap = new Map(teachers.map((item) => [key(item.nip), item.id]))
    const payload = imported.map((row, index) => ({
      classId: reference(classMap, row.class_name, 'Kelas', index + 2, true),
      teacherId: reference(teacherMap, row.teacher_nip, 'NIP Guru Wali aktif', index + 2, true),
    }))
    await Promise.all(payload.map((row) => api.update('classes', row.classId, { homeroom_teacher_id: row.teacherId })))
    await load()
    setToast({ message: `${payload.length} penugasan guru wali berhasil diimpor.` })
  }

  const columns = [
    { key: 'class', label: 'Kelas', render: (row) => <div><strong>{row.name}</strong><small className="block">{row.majors?.name || 'Umum'} · {row.academic_year}</small></div> },
    { key: 'teacher', label: 'Guru Wali Saat Ini', render: (row) => row.teachers ? <div className="person-cell"><span className="avatar small teacher"><UserCog size={16} /></span><div><strong>{row.teachers.name}</strong><small>NIP {row.teachers.nip}</small></div></div> : <span className="muted">Belum ditentukan</span> },
    { key: 'assignment', label: 'Penugasan', render: (row) => <select className="inline-select" value={row.homeroom_teacher_id || ''} disabled={busyId === row.id} onChange={(event) => assign(row, event.target.value)}><option value="">Pilih guru wali</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select> },
  ]

  return (
    <div className="page">
      <PageHeader eyebrow="DATA MASTER" title="Manajemen Guru Wali" description="Tetapkan guru wali untuk setiap kelas dan tahun ajaran." action={<button className="button secondary" type="button" onClick={() => setImportOpen(true)}><Upload size={18} /> Import Excel</button>} />
      <div className="info-banner"><UserCog /><div><strong>Satu langkah untuk penugasan</strong><p>Pilih nama guru pada kolom penugasan. Perubahan tersimpan secara otomatis.</p></div></div>
      <div className="panel table-panel"><DataTable columns={columns} rows={classes} loading={loading} emptyTitle="Belum ada kelas" emptyText="Tambahkan kelas sebelum menetapkan guru wali." /></div>
      <ExcelImport open={importOpen} title="Guru Wali" fileName="template-import-guru-wali.xlsx" columns={excelColumns.homeroom} onClose={() => setImportOpen(false)} onImport={importRows} />
    </div>
  )
}
