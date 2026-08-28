import { CheckCircle2, LogIn, LogOut, ScanFace, Video, VideoOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { bestMatch, detectFace, faceMatchScore, faceQuality, loadFaceModels, median, openCamera, stopCamera } from '../face'

function timeMinutes(value) {
  const [hours, minutes] = String(value || '00:00').slice(0, 5).split(':').map(Number)
  return hours * 60 + minutes
}

function shiftedTime(value, offset) {
  const minutes = (timeMinutes(value) + offset + 1440) % 1440
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}.${String(minutes % 60).padStart(2, '0')}`
}

export default function FaceScanner({ profiles, identityKey, personKey, threshold, entryTime, exitTime, tolerance, disabled, subjectLabel, onRecognized, onStateChange, setToast }) {
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState('entry')
  const [scanState, setScanState] = useState({ type: 'idle', message: 'Kamera belum diaktifkan' })
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const detectingRef = useRef(false)
  const candidateRef = useRef({ key: '', distances: [] })
  const lastSeenRef = useRef({})
  const notificationRef = useRef({ key: '', at: 0 })
  const recognizedRef = useRef(onRecognized)

  const updateState = useCallback((value) => {
    setScanState(value)
    onStateChange?.(value)
  }, [onStateChange])

  function stopScanner() {
    stopCamera(streamRef.current)
    streamRef.current = null
    setScanning(false)
    candidateRef.current = { key: '', distances: [] }
    updateState({ type: 'idle', message: 'Kamera belum diaktifkan' })
  }

  function changeMode(value) {
    stopScanner()
    lastSeenRef.current = {}
    setMode(value)
  }

  async function startScanner() {
    if (!profiles.length) {
      setToast({ type: 'error', message: `Belum ada profil wajah ${subjectLabel} aktif yang dapat dipindai.` })
      return
    }
    setBusy(true)
    try {
      await loadFaceModels()
      streamRef.current = await openCamera(videoRef.current)
      setScanning(true)
      candidateRef.current = { key: '', distances: [] }
      updateState({ type: 'scanning', message: 'Arahkan satu wajah ke area kamera dan tahan posisi' })
    } catch (error) {
      setToast({ type: 'error', message: error.name === 'NotAllowedError' ? 'Izin kamera ditolak oleh browser.' : error.message })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => () => stopCamera(streamRef.current), [])
  useEffect(() => { recognizedRef.current = onRecognized }, [onRecognized])
  useEffect(() => {
    if (!disabled || !scanning) return
    stopCamera(streamRef.current)
    streamRef.current = null
    setScanning(false)
    candidateRef.current = { key: '', distances: [] }
    const state = { type: 'idle', message: 'Kamera belum diaktifkan' }
    setScanState(state)
    onStateChange?.(state)
  }, [disabled, onStateChange, scanning])

  useEffect(() => {
    if (!scanning || disabled) return undefined
    function showFailure(message) {
      updateState({ type: 'unknown', message })
      const now = Date.now()
      if (notificationRef.current.key !== message || now - notificationRef.current.at > 5000) {
        notificationRef.current = { key: message, at: now }
        setToast({ type: 'error', message, sound: true })
      }
    }
    const interval = window.setInterval(async () => {
      if (detectingRef.current || !videoRef.current?.videoWidth) return
      detectingRef.current = true
      try {
        const detection = await detectFace(videoRef.current)
        if (!detection) {
          candidateRef.current = { key: '', distances: [] }
          updateState({ type: 'scanning', message: 'Menunggu wajah terlihat jelas di dalam area kamera.' })
          return
        }
        const qualityMessage = faceQuality(detection, videoRef.current)
        if (qualityMessage) {
          candidateRef.current = { key: '', distances: [] }
          showFailure(qualityMessage)
          return
        }
        const match = bestMatch(detection.descriptor, profiles)
        if (!match || match.distance > threshold) {
          candidateRef.current = { key: '', distances: [] }
          showFailure('Wajah tidak dikenali. Hadapkan wajah ke kamera dan coba lagi.')
          return
        }
        if (match.gap < 0.035) {
          candidateRef.current = { key: '', distances: [] }
          showFailure('Hasil wajah belum cukup pasti. Pastikan hanya satu orang di depan kamera.')
          return
        }

        const candidateKey = `${mode}:${match[identityKey]}`
        const now = Date.now()
        if (now - (lastSeenRef.current[candidateKey] || 0) < 8000) return
        candidateRef.current = candidateRef.current.key === candidateKey
          ? { key: candidateKey, distances: [...candidateRef.current.distances, match.distance].slice(-3) }
          : { key: candidateKey, distances: [match.distance] }
        if (candidateRef.current.distances.length < 3) {
          updateState({ type: 'scanning', message: `Memastikan wajah ${match[personKey].name} (${candidateRef.current.distances.length}/3)…` })
          return
        }

        const distance = median(candidateRef.current.distances)
        const score = faceMatchScore(distance, threshold)
        const result = await recognizedRef.current(match, mode, distance, score)
        lastSeenRef.current[candidateKey] = now
        candidateRef.current = { key: '', distances: [] }
        const state = { type: 'success', message: result.message, person: match[personKey], confidence: result.confidence ?? score, distance, subline: result.subline }
        updateState(state)
        notificationRef.current = { key: result.message, at: now }
        setToast({ message: result.message, sound: true })
      } catch (error) {
        candidateRef.current = { key: '', distances: [] }
        showFailure(error.message)
      } finally {
        detectingRef.current = false
      }
    }, 800)
    return () => window.clearInterval(interval)
  }, [disabled, identityKey, mode, personKey, profiles, scanning, setToast, threshold, updateState])

  return (
    <article className="panel scanner-panel">
      <div className="panel-heading"><div><p className="eyebrow">PEMINDAI BIOMETRIK</p><h2>Wajah {subjectLabel}</h2></div>{scanning && <span className="live-badge"><i /> LIVE</span>}</div>
      <div className="scanner-mode" role="group" aria-label={`Jenis absensi ${subjectLabel}`}><button type="button" className={mode === 'entry' ? 'active' : ''} onClick={() => changeMode('entry')}><LogIn /> <span>Absensi masuk<small>Tepat waktu s.d. {shiftedTime(entryTime, tolerance)}</small></span></button><button type="button" className={mode === 'exit' ? 'active' : ''} onClick={() => changeMode('exit')}><LogOut /> <span>Absensi pulang<small>Mulai {shiftedTime(exitTime, -tolerance)}</small></span></button></div>
      <div className="camera-frame attendance-camera">
        <video ref={videoRef} muted playsInline />
        {scanning && <div className="scan-line" />}
        {!scanning && <div className="camera-placeholder"><VideoOff /><strong>Kamera nonaktif</strong><span>Aktifkan kamera untuk absensi wajah {subjectLabel}.</span></div>}
        {scanning && <div className={`recognition-toast recognition-${scanState.type}`}>{scanState.type === 'success' ? <CheckCircle2 /> : <ScanFace />}<div><strong>{scanState.message}</strong>{scanState.type === 'success' && <small>{scanState.subline ? `${scanState.subline} · ` : ''}skor verifikasi {Number(scanState.confidence).toFixed(1)}% · jarak {Number(scanState.distance).toFixed(3)}</small>}</div></div>}
      </div>
      <div className="scanner-controls">{!scanning ? <button className="button primary" disabled={disabled || busy} onClick={startScanner}><Video size={18} /> {busy ? 'Menyiapkan model...' : 'Aktifkan kamera wajah'}</button> : <button className="button secondary" onClick={stopScanner}><VideoOff size={18} /> Matikan kamera</button>}<span>Ambang jarak maksimum {Number(threshold).toFixed(3)} · {profiles.length} profil</span></div>
    </article>
  )
}
