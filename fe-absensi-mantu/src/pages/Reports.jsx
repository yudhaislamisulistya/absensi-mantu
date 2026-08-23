import { BarChart3, Download, Filter, Printer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { DataTable, EmptyState, PageHeader, formatDate } from '../components/ui'

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

const statusKeys = ['present', 'late', 'sick', 'excused', 'absent']
const statusLabels = { present: 'Hadir', late: 'Terlambat', sick: 'Sakit', excused: 'Izin', absent: 'Alfa' }

export default function Reports({ setToast }) {
  const [period, setPeriod] = useState('month')
  const initial = periodDates('month')
  const [startDate, setStartDate] = useState(initial[0])
  const [endDate, setEndDate] = useState(initial[1])
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [classId, setClassId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [viewBy, setViewBy] = useState('student')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)

  useEffect(() => {
    Promise.all([api.get('classes?select=id,name,grade&order=grade,name'), api.get('students?select=id,nis,name,class_id&status=eq.active&order=name')])
      .then(([classRows, studentRows]) => { setClasses(classRows); setStudents(studentRows) })
      .catch((error) => setToast({ type: 'error', message: error.message }))
  }, [setToast])

  function changePeriod(value) {
    setPeriod(value)
    const [start, end] = periodDates(value)
    setStartDate(start); setEndDate(end)
  }

  async function generate() {
    if (startDate > endDate) { setToast({ type: 'error', message: 'Tanggal awal tidak boleh melewati tanggal akhir.' }); return }
    setLoading(true)
    try {
      let query = `attendance_records?select=attendance_date,status,check_in_at,method,confidence,student_id,class_id,students(id,nis,name),classes(id,name)&attendance_date=gte.${startDate}&attendance_date=lte.${endDate}`
      if (classId) query += `&class_id=eq.${classId}`
      if (studentId) query += `&student_id=eq.${studentId}`
      query += '&order=attendance_date.asc'
      setRecords(await api.get(query))
      setGenerated(true)
    } catch (error) { setToast({ type: 'error', message: error.message }) }
    finally { setLoading(false) }
  }

  const summary = useMemo(() => {
    const result = Object.fromEntries(statusKeys.map((key) => [key, records.filter((row) => row.status === key).length]))
    result.total = records.length
    result.attendanceRate = records.length ? Math.round(((result.present + result.late) / records.length) * 100) : 0
    return result
  }, [records])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const record of records) {
      const subject = viewBy === 'student' ? record.students : record.classes
      const key = subject?.id || 'unknown'
      if (!map.has(key)) map.set(key, { id: key, name: subject?.name || '-', sub: viewBy === 'student' ? `NIS ${subject?.nis || '-'}` : 'Kelas', total: 0, present: 0, late: 0, sick: 0, excused: 0, absent: 0 })
      const row = map.get(key); row.total += 1; row[record.status] += 1
    }
    return [...map.values()].map((row) => ({ ...row, rate: row.total ? Math.round(((row.present + row.late) / row.total) * 100) : 0 })).sort((a, b) => a.name.localeCompare(b.name))
  }, [records, viewBy])

  function exportCsv() {
    if (!grouped.length) return
    const header = ['Nama', 'Identitas', 'Total Hari', 'Hadir', 'Terlambat', 'Sakit', 'Izin', 'Alfa', 'Persentase']
    const values = grouped.map((row) => [row.name, row.sub, row.total, row.present, row.late, row.sick, row.excused, row.absent, `${row.rate}%`])
    const csv = [header, ...values].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    link.download = `laporan-absensi-${startDate}-${endDate}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const eligibleStudents = students.filter((student) => !classId || student.class_id === classId)
  const columns = [
    { key: 'name', label: viewBy === 'student' ? 'Siswa' : 'Kelas', render: (row) => <div><strong>{row.name}</strong><small className="block">{row.sub}</small></div> },
    { key: 'total', label: 'Hari tercatat' },
    ...statusKeys.map((key) => ({ key, label: statusLabels[key], render: (row) => <span className={`report-number report-${key}`}>{row[key]}</span> })),
    { key: 'rate', label: 'Kehadiran', render: (row) => <div className="rate-cell"><strong>{row.rate}%</strong><span><i style={{ width: `${row.rate}%` }} /></span></div> },
  ]

  return (
    <div className="page report-page">
      <PageHeader eyebrow="ANALITIK KEHADIRAN" title="Laporan Absensi" description="Rekap mingguan, bulanan, atau semester untuk setiap kelas dan siswa." action={<div className="report-actions"><button className="button secondary" disabled={!grouped.length} onClick={() => window.print()}><Printer size={17} /> Cetak</button><button className="button primary" disabled={!grouped.length} onClick={exportCsv}><Download size={17} /> Unduh CSV</button></div>} />
      <section className="panel report-filter">
        <div className="period-tabs"><button className={period === 'week' ? 'active' : ''} onClick={() => changePeriod('week')}>Mingguan</button><button className={period === 'month' ? 'active' : ''} onClick={() => changePeriod('month')}>Bulanan</button><button className={period === 'semester' ? 'active' : ''} onClick={() => changePeriod('semester')}>Semester</button></div>
        <div className="filter-grid">
          <label><span>Tanggal awal</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label><span>Tanggal akhir</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          <label><span>Kelas</span><select value={classId} onChange={(e) => { setClassId(e.target.value); setStudentId('') }}><option value="">Semua kelas</option>{classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label><span>Siswa</span><select value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">Semua siswa</option>{eligibleStudents.map((item) => <option value={item.id} key={item.id}>{item.name} — {item.nis}</option>)}</select></label>
          <button className="button primary generate-button" disabled={loading} onClick={generate}><Filter size={17} /> {loading ? 'Menyusun...' : 'Tampilkan laporan'}</button>
        </div>
      </section>

      {generated && <>
        <section className="report-heading-print"><h2>Laporan Kehadiran</h2><p>Periode {formatDate(`${startDate}T00:00:00`)} – {formatDate(`${endDate}T00:00:00`)}</p></section>
        <section className="report-summary">
          <article><span className="stat-icon teal"><BarChart3 /></span><p>Persentase hadir<strong>{summary.attendanceRate}%</strong><small>{summary.present + summary.late} dari {summary.total} catatan</small></p></article>
          {statusKeys.map((key) => <article key={key}><span className={`summary-dot ${key}`} /><p>{statusLabels[key]}<strong>{summary[key]}</strong><small>catatan kehadiran</small></p></article>)}
        </section>
        <section className="panel table-panel report-table-panel">
          <div className="table-toolbar"><div><p className="eyebrow">RINCIAN REKAP</p><h2>{viewBy === 'student' ? 'Rekap per siswa' : 'Rekap per kelas'}</h2></div><div className="view-toggle"><button className={viewBy === 'student' ? 'active' : ''} onClick={() => setViewBy('student')}>Per siswa</button><button className={viewBy === 'class' ? 'active' : ''} onClick={() => setViewBy('class')}>Per kelas</button></div></div>
          {!records.length ? <EmptyState title="Tidak ada catatan absensi" text="Belum ada sesi absensi pada periode dan filter yang dipilih." /> : <DataTable columns={columns} rows={grouped} />}
        </section>
      </>}
      {!generated && <section className="panel"><EmptyState title="Laporan siap disusun" text="Pilih periode dan filter, kemudian klik “Tampilkan laporan”." /></section>}
    </div>
  )
}
