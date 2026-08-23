import { ArrowRight, Camera, CheckCircle2, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'
import { useState } from 'react'
import { api, session } from '../api'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const value = await api.rpc('login', { p_username: username, p_password: password })
      session.set(value)
      onLogin(value)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="login-visual-inner">
          <div className="login-brand"><span><ShieldCheck /></span><strong>Absensi Mantu</strong></div>
          <div className="login-message">
            <p className="eyebrow light">ABSENSI CERDAS UNTUK SEKOLAH</p>
            <h1>Kehadiran akurat.<br />Sekolah lebih teratur.</h1>
            <p>Kelola data akademik dan catat kehadiran siswa dengan pengenalan wajah yang cepat dalam satu sistem.</p>
            <div className="login-points">
              <span><CheckCircle2 /> Presensi real-time per kelas</span>
              <span><CheckCircle2 /> Laporan mingguan hingga semester</span>
              <span><CheckCircle2 /> Data wajah dikelola secara mandiri</span>
            </div>
          </div>
          <div className="face-art" aria-hidden="true"><Camera /><i /><b /></div>
          <p className="login-copyright">© {new Date().getFullYear()} Absensi Mantu</p>
        </div>
      </section>
      <section className="login-form-side">
        <form className="login-card" onSubmit={submit}>
          <div className="mobile-login-brand"><span><ShieldCheck /></span><strong>Absensi Mantu</strong></div>
          <p className="eyebrow">PORTAL ADMINISTRATOR</p>
          <h2>Selamat datang kembali</h2>
          <p className="login-subtitle">Masuk untuk mengelola data dan kehadiran siswa.</p>
          {error && <div className="form-error">{error}</div>}
          <label className="field">
            <span>Username</span>
            <div className="input-icon"><UserRound /><input autoFocus required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Masukkan username" /></div>
          </label>
          <label className="field">
            <span>Password</span>
            <div className="input-icon"><LockKeyhole /><input required minLength="8" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Tampilkan password">{showPassword ? <EyeOff /> : <Eye />}</button></div>
          </label>
          <button className="button primary login-submit" disabled={busy}>{busy ? 'Memverifikasi...' : <>Masuk ke sistem <ArrowRight size={18} /></>}</button>
          <p className="login-help">Hubungi pengelola sistem jika Anda lupa kredensial.</p>
        </form>
      </section>
    </main>
  )
}
