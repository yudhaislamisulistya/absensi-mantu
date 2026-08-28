import { BarChart3, Download, Filter, Printer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import writeExcelFile from 'write-excel-file/browser'
import { api } from '../api'
import { DataTable, PageHeader, formatDate, formatTime } from '../components/ui'

function iso(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

function periodDates(period) {
  const now = new Date()
  if (period === 'week') {
    const day = now.getDay() || 7
    const start = new Date(now); start.setDate(now.getDate() - day + 1)
    const end = new Date(start); end.setDate(start.getDate() + 6)
    return [iso(start), iso(end)]
  }
  if (period === 'month') return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))]
  const startMonth = now.getMonth() < 6 ? 0 : 6
  return [iso(new Date(now.getFullYear(), startMonth, 1)), iso(new Date(now.getFullYear(), startMonth + 6, 0))]
}

const statusKeys = ['present', 'late', 'absent']
const statusLabels = { present: 'Hadir', late: 'Terlambat', absent: 'Tidak hadir' }
const headerCell = (value) => ({ value, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#0F766E', alignVertical: 'center' })

export default function Reports({ setToast }) {
  const [subject, setSubject] = useState('student')
  const [period, setPeriod] = useState('month')
  const initial = periodDates('month')
  const [startDate, setStartDate] = useState(initial[0])
  const [endDate, setEndDate] = useState(initial[1])
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [teachers, setTeachers] = useState([])
  const [classId, setClassId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [viewBy, setViewBy] = useState('student')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('classes?select=id,name,grade&order=grade,name'),
      api.get('students?select=id,nis,name,class_id&status=eq.active&order=name'),
      api.get('teachers?select=id,nip,name&status=eq.active&order=name'),
    ]).then(([classRows, studentRows, teacherRows]) => {
      setClasses(classRows)
      setStudents(studentRows)
      setTeachers(teacherRows)
    }).catch((error) => setToast({ type: 'error', message: error.message }))
  }, [setToast])

  function changeSubject(value) {
    setSubject(value)
    setViewBy(value)
    setRecords([])
    setGenerated(false)
  }

  function changePeriod(value) {
    setPeriod(value)
    const [start, end] = periodDates(value)
    setStartDate(start)
    setEndDate(end)
  }

  async function generate() {
    if (startDate > endDate) {
      setToast({ type: 'error', message: 'Tanggal awal tidak boleh melewati tanggal akhir.' })
      return
    }
    setLoading(true)
    try {
      let query
      if (subject === 'student') {
        query = `attendance_records?select=attendance_date,status,check_in_at,check_out_at,method,confidence,student_id,class_id,students(id,nis,name),classes(id,name)&attendance_date=gte.${startDate}&attendance_date=lte.${endDate}`
        if (classId) query += `&class_id=eq.${classId}`
        if (studentId) query += `&student_id=eq.${studentId}`
      } else {
        query = `teacher_attendance_records?select=attendance_date,status,check_in_at,check_out_at,method,teacher_id,teachers(id,nip,name)&attendance_date=gte.${startDate}&attendance_date=lte.${endDate}`
        if (teacherId) query += `&teacher_id=eq.${teacherId}`
      }
      query += '&order=attendance_date.asc'
      setRecords(await api.get(query))
      setGenerated(true)
    } catch (error) {
      setToast({ type: 'error', message: error.message })
    } finally {
      setLoading(false)
    }
  }

  const summary = useMemo(() => {
    const result = Object.fromEntries(statusKeys.map((key) => [key, records.filter((row) => row.status === key).length]))
    result.total = records.length
    result.checkedOut = records.filter((row) => row.check_out_at).length
    result.attendanceRate = records.length ? Math.round(((result.present + result.late) / records.length) * 100) : 0
    return result
  }, [records])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const record of records) {
      let key
      let name
      let sub
      if (viewBy === 'student') {
        key = record.students?.id || 'unknown'
        name = record.students?.name || '-'
        sub = `NIS ${record.students?.nis || '-'}`
      } else if (viewBy === 'teacher') {
        key = record.teachers?.id || 'unknown'
        name = record.teachers?.name || '-'
        sub = `NIP ${record.teachers?.nip || '-'}`
      } else if (viewBy === 'class') {
        key = record.classes?.id || 'unknown'
        name = record.classes?.name || '-'
        sub = 'Rekap kelas'
      } else {
        key = record.attendance_date
        name = formatDate(`${record.attendance_date}T00:00:00`)
        sub = subject === 'student' ? 'Rekap siswa' : 'Rekap guru'
      }
      if (!map.has(key)) map.set(key, { id: key, name, sub, total: 0, present: 0, late: 0, absent: 0, checkedOut: 0 })
      const row = map.get(key)
      row.total += 1
      row[record.status] += 1
      if (record.check_out_at) row.checkedOut += 1
    }
    return [...map.values()]
      .map((row) => ({ ...row, rate: row.total ? Math.round(((row.present + row.late) / row.total) * 100) : 0 }))
      .sort((a, b) => viewBy === 'date' ? a.id.localeCompare(b.id) : a.name.localeCompare(b.name))
  }, [records, subject, viewBy])

  async function exportExcel() {
    if (!grouped.length) return
    const subjectName = subject === 'student' ? 'Siswa' : 'Guru'
    const summaryHeader = ['Nama', 'Identitas', 'Total Catatan', 'Hadir', 'Terlambat', 'Tidak Hadir', 'Sudah Absen Pulang', 'Persentase Kehadiran']
    const summaryRows = [
      [{ value: `Laporan Absensi ${subjectName}`, fontWeight: 'bold', fontSize: 16, color: '#164E45' }],
      [`Periode: ${formatDate(`${startDate}T00:00:00`)} sampai ${formatDate(`${endDate}T00:00:00`)}`],
      [`Persentase kehadiran keseluruhan: ${summary.attendanceRate}%`],
      summaryHeader.map(headerCell),
      ...grouped.map((row) => [row.name, row.sub, row.total, row.present, row.late, row.absent, row.checkedOut, `${row.rate}%`]),
    ]
    const detailHeader = subject === 'student'
      ? ['Tanggal', 'NIS', 'Nama Siswa', 'Kelas', 'Status', 'Masuk', 'Pulang', 'Metode', 'Kecocokan']
      : ['Tanggal', 'NIP', 'Nama Guru', 'Status', 'Masuk', 'Pulang', 'Metode']
    const detailRows = [
      detailHeader.map(headerCell),
      ...records.map((row) => subject === 'student'
        ? [row.attendance_date, row.students?.nis || '-', row.students?.name || '-', row.classes?.name || '-', statusLabels[row.status], formatTime(row.check_in_at), formatTime(row.check_out_at), row.method === 'face' ? 'Wajah' : 'Manual', row.confidence === null ? '-' : `${row.confidence}%`]
        : [row.attendance_date, row.teachers?.nip || '-', row.teachers?.name || '-', statusLabels[row.status], formatTime(row.check_in_at), formatTime(row.check_out_at), 'Manual']),
    ]
    try {
      await writeExcelFile([
        { data: summaryRows, sheet: 'Ringkasan', columns: [{ width: 28 }, { width: 18 }, ...Array(6).fill({ width: 18 })], stickyRowsCount: 4, orientation: 'landscape' },
        { data: detailRows, sheet: 'Data Detail', columns: detailHeader.map((_, index) => ({ width: index === 2 ? 28 : 18 })), stickyRowsCount: 1, orientation: 'landscape' },
      ]).toFile(`laporan-absensi-${subject}-${startDate}-${endDate}.xlsx`)
      setToast({ message: 'Laporan Excel berhasil dibuat.' })
    } catch (error) {
      setToast({ type: 'error', message: `Laporan Excel gagal dibuat: ${error.message}` })
    }
  }

  const eligibleStudents = students.filter((student) => !classId || student.class_id === classId)
  const subjectLabel = viewBy === 'student' ? 'Siswa' : viewBy === 'teacher' ? 'Guru' : viewBy === 'class' ? 'Kelas' : 'Tanggal'
  const totalLabel = ['student', 'teacher'].includes(viewBy) ? 'Hari tercatat' : viewBy === 'class' ? 'Catatan siswa' : subject === 'student' ? 'Total siswa' : 'Total guru'
  const columns = [
    { key: 'name', label: subjectLabel, render: (row) => <div><strong>{row.name}</strong><small className="block">{row.sub}</small></div> },
    { key: 'total', label: totalLabel },
    ...statusKeys.map((key) => ({ key, label: statusLabels[key], render: (row) => <span className={`report-number report-${key}`}>{row[key]}</span> })),
    { key: 'checkedOut', label: 'Absen pulang', render: (row) => <span className="report-number report-checked-out">{row.checkedOut}</span> },
    { key: 'rate', label: 'Kehadiran', render: (row) => <div className="rate-cell"><strong>{row.rate}%</strong><span><i style={{ width: `${row.rate}%` }} /></span></div> },
  ]
  const subjectName = subject === 'student' ? 'siswa' : 'guru'

  return (
    <div className="page report-page">
      <PageHeader eyebrow="ANALITIK KEHADIRAN" title="Laporan Absensi Sekolah" description="Rekap absensi masuk dan pulang siswa maupun guru dalam format Excel yang siap diolah." action={<div className="report-actions"><button className="button secondary" disabled={!grouped.length} onClick={() => window.print()}><Printer size={17} /> Cetak</button><button className="button primary" disabled={!grouped.length} onClick={exportExcel}><Download size={17} /> Unduh Excel</button></div>} />
      <section className="panel report-filter">
        <div className="report-type-tabs"><button className={subject === 'student' ? 'active' : ''} onClick={() => changeSubject('student')}>Laporan siswa</button><button className={subject === 'teacher' ? 'active' : ''} onClick={() => changeSubject('teacher')}>Laporan guru</button></div>
        <div className="period-tabs"><button className={period === 'week' ? 'active' : ''} onClick={() => changePeriod('week')}>Mingguan</button><button className={period === 'month' ? 'active' : ''} onClick={() => changePeriod('month')}>Bulanan</button><button className={period === 'semester' ? 'active' : ''} onClick={() => changePeriod('semester')}>Semester</button></div>
        <div className="filter-grid">
          <label><span>Tanggal awal</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label><span>Tanggal akhir</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          {subject === 'student' ? <><label><span>Kelas</span><select value={classId} onChange={(event) => { setClassId(event.target.value); setStudentId('') }}><option value="">Semua kelas</option>{classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>Siswa</span><select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Semua siswa</option>{eligibleStudents.map((item) => <option value={item.id} key={item.id}>{item.name} — {item.nis}</option>)}</select></label></> : <label><span>Guru</span><select value={teacherId} onChange={(event) => setTeacherId(event.target.value)}><option value="">Semua guru</option>{teachers.map((item) => <option value={item.id} key={item.id}>{item.name} — {item.nip}</option>)}</select></label>}
          <button className="button primary generate-button" disabled={loading} onClick={generate}><Filter size={17} /> {loading ? 'Menyusun...' : 'Tampilkan laporan'}</button>
        </div>
      </section>

      {generated && (
        <>
          <section className="report-heading-print"><h2>Laporan Kehadiran {subject === 'student' ? 'Siswa' : 'Guru'}</h2><p>Periode {formatDate(`${startDate}T00:00:00`)} – {formatDate(`${endDate}T00:00:00`)}</p></section>
          <section className="report-summary report-summary-five">
            <article><span className="stat-icon teal"><BarChart3 /></span><p>Persentase hadir<strong>{summary.attendanceRate}%</strong><small>{summary.present + summary.late} dari {summary.total} catatan {subjectName}</small></p></article>
            {statusKeys.map((key) => <article key={key}><span className={`summary-dot ${key}`} /><p>{statusLabels[key]}<strong>{summary[key]}</strong><small>catatan {subjectName}</small></p></article>)}
            <article><span className="summary-dot checked-out" /><p>Sudah absen pulang<strong>{summary.checkedOut}</strong><small>catatan {subjectName}</small></p></article>
          </section>
          <section className="panel table-panel report-table-panel">
            <div className="table-toolbar"><div><p className="eyebrow">HASIL REKAP</p><h2>Rincian kehadiran {subjectName}</h2></div><select value={viewBy} onChange={(event) => setViewBy(event.target.value)}>{subject === 'student' ? <><option value="student">Tampilkan per siswa</option><option value="class">Tampilkan per kelas</option></> : <option value="teacher">Tampilkan per guru</option>}<option value="date">Tampilkan per hari</option></select></div>
            <DataTable columns={columns} rows={grouped} loading={loading} emptyTitle={`Tidak ada data kehadiran ${subjectName}`} emptyText="Tidak ditemukan catatan pada periode dan filter yang dipilih." />
          </section>
        </>
      )}
    </div>
  )
}
