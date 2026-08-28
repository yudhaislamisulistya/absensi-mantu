import { KeyRound, Save } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, session } from './api'
import Shell, { navigation } from './components/Shell'
import { Field, Modal, Toast } from './components/ui'
import Attendance from './pages/Attendance'
import { ClassesPage, HomeroomPage, MajorsPage, StudentsPage, TeachersPage } from './pages/CrudPages'
import Dashboard from './pages/Dashboard'
import FaceRegistration from './pages/FaceRegistration'
import Login from './pages/Login'
import Reports from './pages/Reports'
import SettingsPage from './pages/Settings'
import TeacherAttendance from './pages/TeacherAttendance'

function validPage() {
  const hash = window.location.hash.replace('#', '')
  return navigation.some((item) => item.id === hash) ? hash : 'dashboard'
}

function ChangePassword({ open, onClose, setToast }) {
  const [form, setForm] = useState({ current: '', next: '', confirmation: '' })
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault()
    if (form.next !== form.confirmation) { setToast({ type: 'error', message: 'Konfirmasi password baru tidak sama.' }); return }
    setBusy(true)
    try {
      await api.rpc('change_password', { p_current_password: form.current, p_new_password: form.next })
      setToast({ message: 'Password berhasil diubah.' })
      setForm({ current: '', next: '', confirmation: '' })
      onClose()
    } catch (error) { setToast({ type: 'error', message: error.message }) }
    finally { setBusy(false) }
  }
  return <Modal open={open} title="Ubah password" description="Gunakan minimal 8 karakter dan simpan kredensial dengan aman." onClose={onClose}><form onSubmit={submit}><div className="modal-body form-grid"><div className="password-icon"><KeyRound /></div><Field label="Password saat ini" required><input type="password" minLength="8" required value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /></Field><Field label="Password baru" required><input type="password" minLength="8" required value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /></Field><Field label="Ulangi password baru" required><input type="password" minLength="8" required value={form.confirmation} onChange={(e) => setForm({ ...form, confirmation: e.target.value })} /></Field></div><div className="modal-footer"><button className="button secondary" type="button" onClick={onClose}>Batal</button><button className="button primary" disabled={busy}><Save size={17} /> {busy ? 'Menyimpan...' : 'Simpan password'}</button></div></form></Modal>
}

export default function App() {
  const [auth, setAuth] = useState(() => session.get())
  const [page, setPageState] = useState(validPage)
  const [toast, setToastState] = useState(null)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const setToast = useCallback((value) => setToastState(value), [])

  useEffect(() => {
    const hashChange = () => setPageState(validPage())
    const expired = () => { setAuth(null); setToast({ type: 'error', message: 'Sesi Anda berakhir. Silakan masuk kembali.' }) }
    window.addEventListener('hashchange', hashChange)
    window.addEventListener('auth-expired', expired)
    return () => { window.removeEventListener('hashchange', hashChange); window.removeEventListener('auth-expired', expired) }
  }, [setToast])
  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToastState(null), 4500)
    return () => window.clearTimeout(timer)
  }, [toast])

  function setPage(value) {
    window.location.hash = value
    setPageState(value)
  }
  function logout() {
    session.clear()
    setAuth(null)
  }

  if (!auth?.token || !auth?.user) return <><Login onLogin={setAuth} /><Toast toast={toast} onClose={() => setToastState(null)} /></>

  const pages = {
    dashboard: <Dashboard setPage={setPage} />,
    students: <StudentsPage setToast={setToast} />,
    classes: <ClassesPage setToast={setToast} />,
    teachers: <TeachersPage setToast={setToast} />,
    majors: <MajorsPage setToast={setToast} />,
    homeroom: <HomeroomPage setToast={setToast} />,
    faces: <FaceRegistration setToast={setToast} />,
    attendance: <Attendance setToast={setToast} />,
    'teacher-attendance': <TeacherAttendance setToast={setToast} />,
    reports: <Reports setToast={setToast} />,
    settings: <SettingsPage setToast={setToast} />,
  }

  return <><Shell page={page} setPage={setPage} user={auth.user} onLogout={logout} onChangePassword={() => setPasswordOpen(true)}>{pages[page] || pages.dashboard}</Shell><ChangePassword open={passwordOpen} onClose={() => setPasswordOpen(false)} setToast={setToast} /><Toast toast={toast} onClose={() => setToastState(null)} /></>
}
