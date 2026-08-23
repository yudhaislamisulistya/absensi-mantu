import {
  BarChart3, BookOpen, Building2, Camera, ChevronDown, Clock, GraduationCap, Home,
  LogOut, Menu, School, Settings, ShieldCheck, UserCog, Users, X,
} from 'lucide-react'
import { useState } from 'react'
import { initials } from './ui'

export const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { section: 'Data Master' },
  { id: 'students', label: 'Data Siswa', icon: GraduationCap },
  { id: 'classes', label: 'Data Kelas', icon: School },
  { id: 'teachers', label: 'Data Guru', icon: Users },
  { id: 'majors', label: 'Data Jurusan', icon: BookOpen },
  { id: 'homeroom', label: 'Guru Wali', icon: UserCog },
  { section: 'Kehadiran' },
  { id: 'faces', label: 'Registrasi Wajah', icon: Camera },
  { id: 'attendance', label: 'Absensi Siswa', icon: ShieldCheck },
  { id: 'reports', label: 'Laporan', icon: BarChart3 },
  { section: 'Sistem' },
  { id: 'settings', label: 'Pengaturan Waktu', icon: Clock },
]

export default function Shell({ page, setPage, user, onLogout, onChangePassword, children }) {
  const [drawer, setDrawer] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const active = navigation.find((item) => item.id === page)

  function navigate(id) {
    setPage(id)
    setDrawer(false)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${drawer ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <span className="brand-mark"><Building2 /></span>
          <div><strong>Absensi Mantu</strong><small>School System</small></div>
          <button className="icon-button sidebar-close" type="button" aria-label="Tutup menu" onClick={() => setDrawer(false)}><X /></button>
        </div>
        <nav>
          {navigation.map((item, index) => item.section ? (
            <p className="nav-section" key={`${item.section}-${index}`}>{item.section}</p>
          ) : (
            <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}>
              <item.icon size={19} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-help">
          <span><ShieldCheck /></span><strong>Data terlindungi</strong><p>Template wajah hanya dapat diakses oleh admin.</p>
        </div>
      </aside>
      {drawer && <button className="drawer-backdrop" aria-label="Tutup menu" onClick={() => setDrawer(false)} />}

      <div className="main-column">
        <header className="topbar">
          <button className="icon-button menu-button" type="button" aria-label="Buka menu" onClick={() => setDrawer(true)}><Menu /></button>
          <div className="breadcrumb"><span>Absensi Mantu</span><i>/</i><strong>{active?.label || 'Dashboard'}</strong></div>
          <div className="profile-wrap">
            <button className="profile-button" type="button" onClick={() => setProfileOpen(!profileOpen)}>
              <span className="avatar">{initials(user.name)}</span>
              <span className="profile-copy"><strong>{user.name}</strong><small>Administrator</small></span>
              <ChevronDown size={16} />
            </button>
            {profileOpen && (
              <div className="profile-menu">
                <button type="button" onClick={() => { setProfileOpen(false); onChangePassword() }}><Settings size={17} /> Ubah password</button>
                <button type="button" onClick={onLogout}><LogOut size={17} /> Keluar</button>
              </div>
            )}
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  )
}
