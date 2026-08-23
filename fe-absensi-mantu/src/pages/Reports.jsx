import { BarChart3, Download, Filter, Printer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { DataTable, PageHeader, formatDate } from '../components/ui'

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
    Promise.all([
      api.get('classes?select=id,name,grade&order=grade,name'),
      api.get('students?select=id,nis,name,class_id&status=eq.active&order=name'),
    ]).then(([classRows, studentRows]) => {
      setClasses(classRows)
      setStudents(studentRows)
    }).catch((error) => setToast({ type: 'error', message: error.message }))
  }, [setToast])

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
      let query = `attendance_records?select=attendance_date,status,check_in_at,method,confidence,student_id,class_id,students(id,nis,name),classes(id,name)&attendance_date=gte.${startDate}&attendance_date=lte.${endDate}`
      if (classId) query += `&class_id=eq.${classId}`
      if (studentId) query += `&student_id=eq.${studentId}`
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
      } else if (viewBy === 'class') {
        key = record.classes?.id || 'unknown'
        name = record.classes?.name || '-'
        sub = 'Rekap kelas'
      } else {
        key = record.attendance_date
        name = formatDate(`${record.attendance_date}T00:00:00`)
        sub = 'Rekap sekolah'
      }
      if (!map.has(key)) map.set(key, { id: key, name, sub, total: 0, present: 0, late: 0, absent: 0 })
      const row = map.get(key)
      row.total += 1
      row[record.status] += 1
    }
    return [...map.values()]
      .map((row) => ({ ...row, rate: row.total ? Math.round(((row.present + row.late) / row.total) * 100) : 0 }))
      .sort((a, b) => viewBy === 'date' ? a.id.localeCompare(b.id) : a.name.localeCompare(b.name))
  }, [records, viewBy])

  function exportCsv() {
    if (!grouped.length) return
    const header = ['Nama', 'Identitas', 'Total Catatan', 'Hadir', 'Terlambat', 'Tidak Hadir', 'Persentase Kehadiran']
    const values = grouped.map((row) => [row.name, row.sub, row.total, row.present, row.late, row.absent, `${row.rate}%`])
    const csv = [header, ...values].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    link.download = `laporan-absensi-sekolah-${startDate}-${endDate}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const eligibleStudents = students.filter((student) => !classId || student.class_id === classId)
  const subjectLabel = viewBy === 'student' ? 'Siswa' : viewBy === 'class' ? 'Kelas' : 'Tanggal'
  const totalLabel = viewBy === 'student' ? 'Hari tercatat' : viewBy === 'class' ? 'Catatan siswa' : 'Total siswa'
  const columns = [
    { key: 'name', label: subjectLabel, render: (row) => <div><strong>{row.name}</strong><small className="block">{row.sub}</small></div> },
    { key: 'total', label: totalLabel },
    ...statusKeys.map((key) => ({ key, label: statusLabels[key], render: (row) => <span className={`report-number report-${key}`}>{row[key]}</span> })),
    { key: 'rate', label: 'Kehadiran', render: (row) => <div className="rate-cell"><strong>{row.rate}%</strong><span><i style={{ width: `${row.rate}%` }} /></span></div> },
  ]

  return (
    <div className="page report-page">
      <PageHeader eyebrow="ANALITIK KEHADIRAN" title="Laporan Absensi Sekolah" description="Rekap kehadiran harian, mingguan, bulanan, atau semester; dapat difilter per kelas dan per siswa." action={<div className="report-actions"><button className="button secondary" disabled={!grouped.length} onClick={() => window.print()}><Printer size={17} /> Cetak</button><button className="button primary" disabled={!grouped.length} onClick={exportCsv}><Download size={17} /> Unduh CSV</button></div>} />
      <section className="panel report-filter">
        <div className="period-tabs"><button className={period === 'week' ? 'active' : ''} onClick={() => changePeriod('week')}>Mingguan</button><button className={period === 'month' ? 'active' : ''} onClick={() => changePeriod('month')}>Bulanan</button><button className={period === 'semester' ? 'active' : ''} onClick={() => changePeriod('semester')}>Semester</button></div>
        <div className="filter-grid">
          <label><span>Tanggal awal</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label><span>Tanggal akhir</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <label><span>Kelas</span><select value={classId} onChange={(event) => { setClassId(event.target.value); setStudentId('') }}><option value="">Semua kelas</option>{classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label><span>Siswa</span><select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Semua siswa</option>{eligibleStudents.map((item) => <option value={item.id} key={item.id}>{item.name} — {item.nis}</option>)}</select></label>
          <button className="button primary generate-button" disabled={loading} onClick={generate}><Filter size={17} /> {loading ? 'Menyusun...' : 'Tampilkan laporan'}</button>
        </div>
      </section>

      {generated && (
        <>
          <section className="report-heading-print"><h2>Laporan Kehadiran Sekolah</h2><p>Periode {formatDate(`${startDate}T00:00:00`)} – {formatDate(`${endDate}T00:00:00`)}</p></section>
          <section className="report-summary report-summary-four">
            <article><span className="stat-icon teal"><BarChart3 /></span><p>Persentase hadir<strong>{summary.attendanceRate}%</strong><small>{summary.present + summary.late} dari {summary.total} catatan siswa</small></p></article>
            {statusKeys.map((key) => <article key={key}><span className={`summary-dot ${key}`} /><p>{statusLabels[key]}<strong>{summary[key]}</strong><small>catatan siswa</small></p></article>)}
          </section>
          <section className="panel table-panel report-table-panel">
            <div className="table-toolbar"><div><p className="eyebrow">HASIL REKAP</p><h2>Rincian kehadiran</h2></div><select value={viewBy} onChange={(event) => setViewBy(event.target.value)}><option value="student">Tampilkan per siswa</option><option value="class">Tampilkan per kelas</option><option value="date">Tampilkan per hari</option></select></div>
            <DataTable columns={columns} rows={grouped} loading={loading} emptyTitle="Tidak ada data kehadiran" emptyText="Tidak ditemukan catatan pada periode dan filter yang dipilih." />
          </section>
        </>
      )}
    </div>
  )
}
