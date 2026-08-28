import { Activity, BookOpen, Camera, CheckCircle2, Clock3, GraduationCap, School, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { EmptyState, Loading, PageHeader, StatusBadge, formatTime } from '../components/ui'

function localDate(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

export default function Dashboard({ setPage }) {
  const [summary, setSummary] = useState(null)
  const [sessions, setSessions] = useState([])
  const [weekRecords, setWeekRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const start = new Date()
    start.setDate(start.getDate() - 6)
    Promise.all([
      api.rpc('get_dashboard_summary'),
      api.get('attendance_sessions?select=id,attendance_date,started_at,status,attendance_records(status)&order=started_at.desc&limit=5'),
      api.get(`attendance_records?select=attendance_date,status&attendance_date=gte.${localDate(start)}&order=attendance_date.asc`),
    ]).then(([stats, recent, records]) => {
      setSummary(stats)
      setSessions(recent)
      setWeekRecords(records)
    }).finally(() => setLoading(false))
  }, [])

  const chart = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - 6 + index)
    const key = localDate(date)
    const rows = weekRecords.filter((record) => record.attendance_date === key)
    const present = rows.filter((record) => ['present', 'late'].includes(record.status)).length
    return {
      key,
      label: new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(date),
      present,
      total: rows.length,
      rate: rows.length ? Math.round((present / rows.length) * 100) : 0,
    }
  }), [weekRecords])
  const maxRate = Math.max(100, ...chart.map((item) => item.rate))

  if (loading) return <Loading label="Menyiapkan dashboard..." />

  const stats = [
    { label: 'Siswa aktif', value: summary?.students || 0, icon: GraduationCap, tone: 'teal', note: `${summary?.face_registered || 0} wajah terdaftar` },
    { label: 'Guru aktif', value: summary?.teachers || 0, icon: Users, tone: 'blue', note: `${summary?.teacher_face_registered || 0} wajah terdaftar` },
    { label: 'Total kelas', value: summary?.classes || 0, icon: School, tone: 'purple', note: `${summary?.majors || 0} jurusan` },
    { label: 'Hadir hari ini', value: summary?.present_today || 0, icon: CheckCircle2, tone: 'amber', note: summary?.sessions_today ? 'Sesi sekolah sudah dibuat' : 'Sesi sekolah belum dibuat' },
  ]

  return (
    <div className="page dashboard-page">
      <PageHeader eyebrow="RINGKASAN SEKOLAH" title="Selamat datang, Administrator" description="Pantau data akademik dan kehadiran siswa hari ini." action={<button className="button primary" onClick={() => setPage('attendance')}><Camera size={18} /> Mulai absensi</button>} />

      <section className="stat-grid">
        {stats.map((stat) => <article className="stat-card" key={stat.label}><span className={`stat-icon ${stat.tone}`}><stat.icon /></span><div><p>{stat.label}</p><strong>{stat.value.toLocaleString('id-ID')}</strong><small>{stat.note}</small></div></article>)}
      </section>

      <section className="dashboard-grid">
        <article className="panel attendance-chart-panel">
          <div className="panel-heading"><div><p className="eyebrow">7 HARI TERAKHIR</p><h2>Tren kehadiran</h2></div><span className="panel-badge"><Activity size={15} /> Persentase hadir</span></div>
          <div className="bar-chart">
            {chart.map((day) => <div className="bar-column" key={day.key}><div className="bar-value">{day.total ? `${day.rate}%` : '–'}</div><div className="bar-track"><i style={{ height: `${(day.rate / maxRate) * 100}%` }} /></div><span>{day.label}</span></div>)}
          </div>
          <div className="chart-note"><CheckCircle2 size={17} /><span>Kehadiran hari ini</span><strong>{summary?.present_today || 0} siswa</strong><i /> <span>Belum hadir</span><strong>{summary?.absent_today || 0} siswa</strong></div>
        </article>

        <article className="panel quick-panel">
          <div className="panel-heading"><div><p className="eyebrow">AKSES CEPAT</p><h2>Kelola data</h2></div></div>
          <div className="quick-links">
            <button onClick={() => setPage('students')}><span className="teal"><GraduationCap /></span><div><strong>Data siswa</strong><small>Tambah dan kelola siswa</small></div></button>
            <button onClick={() => setPage('classes')}><span className="blue"><School /></span><div><strong>Data kelas</strong><small>Atur kelas dan jurusan</small></div></button>
            <button onClick={() => setPage('faces')}><span className="purple"><Camera /></span><div><strong>Registrasi wajah</strong><small>Daftarkan profil wajah</small></div></button>
            <button onClick={() => setPage('reports')}><span className="amber"><BookOpen /></span><div><strong>Laporan</strong><small>Lihat rekap kehadiran</small></div></button>
          </div>
        </article>
      </section>

      <article className="panel recent-panel">
        <div className="panel-heading"><div><p className="eyebrow">AKTIVITAS TERBARU</p><h2>Sesi absensi</h2></div><button className="text-button" onClick={() => setPage('attendance')}>Lihat semua</button></div>
        {!sessions.length ? <EmptyState title="Belum ada sesi absensi" text="Mulai absensi sekolah dari pos ruang guru untuk melihat aktivitas." /> : (
          <div className="session-list">
            {sessions.map((item) => {
              const present = item.attendance_records?.filter((row) => ['present', 'late'].includes(row.status)).length || 0
              return <div className="session-row" key={item.id}><span className="session-icon"><Clock3 /></span><div><strong>Absensi sekolah</strong><small>{new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(`${item.attendance_date}T00:00:00`))} · {formatTime(item.started_at)}</small></div><div className="session-count"><strong>{present}/{item.attendance_records?.length || 0}</strong><small>Hadir</small></div><StatusBadge value={item.status} /></div>
            })}
          </div>
        )}
      </article>
    </div>
  )
}
