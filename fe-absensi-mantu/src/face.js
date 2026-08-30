let faceApiPromise

export async function loadFaceModels() {
  if (!faceApiPromise) {
    faceApiPromise = import('@vladmandic/face-api').then(async (faceapi) => {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
      ])
      return faceapi
    }).catch((error) => {
      faceApiPromise = undefined
      throw error
    })
  }
  return faceApiPromise
}

export async function detectFace(video, inputSize = 416) {
  const faceapi = await loadFaceModels()
  return faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.45 }))
    .withFaceLandmarks()
    .withFaceDescriptor()
}

export function faceQuality(result, video) {
  if (!result) return 'Wajah belum terdeteksi. Pastikan wajah terlihat utuh dan pencahayaan cukup.'
  const box = result.detection?.box
  if (Number(result.detection?.score || 0) < 0.7) return 'Wajah terdeteksi kurang jelas. Tambahkan cahaya dari arah depan.'
  if (box && video?.videoWidth && box.width / video.videoWidth < 0.2) return 'Wajah terlalu jauh. Dekatkan posisi ke kamera.'
  if (box && video?.videoWidth && (box.x < 0 || box.x + box.width > video.videoWidth)) return 'Wajah belum berada penuh di dalam area kamera.'
  return ''
}

export function bestMatch(descriptor, profiles) {
  const matches = []
  for (const profile of profiles) {
    const distances = []
    for (const saved of profile.descriptors || []) {
      if (!Array.isArray(saved) || saved.length !== descriptor.length) continue
      let squared = 0
      for (let index = 0; index < descriptor.length; index += 1) {
        squared += (descriptor[index] - saved[index]) ** 2
      }
      distances.push(Math.sqrt(squared))
    }
    distances.sort((a, b) => a - b)
    const selected = distances.slice(0, Math.min(3, distances.length))
    if (selected.length) matches.push({ ...profile, distance: selected.reduce((sum, value) => sum + value, 0) / selected.length })
  }
  matches.sort((a, b) => a.distance - b.distance)
  return matches[0] ? { ...matches[0], secondDistance: matches[1]?.distance ?? Infinity, gap: (matches[1]?.distance ?? Infinity) - matches[0].distance } : null
}

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return Infinity
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function attendanceEventKey(mode, identity) {
  return `${mode}:${identity}`
}

export function attendanceSuccessMessage(mode, name) {
  return `Absensi ${mode === 'exit' ? 'pulang' : 'masuk'} atas nama ${String(name || '').trim()} berhasil dilakukan.`
}

// Skor verifikasi, bukan probabilitas: ambang penolakan dipetakan ke 70 dan kecocokan identik ke 100.
export function faceMatchScore(distance, threshold) {
  if (!Number.isFinite(distance) || !Number.isFinite(threshold) || threshold <= 0) return 0
  return Math.round(Math.max(0, Math.min(100, 100 - (30 * distance) / threshold)) * 100) / 100
}

export function videoThumbnail(video) {
  const canvas = document.createElement('canvas')
  const ratio = Math.min(1, 320 / video.videoWidth)
  canvas.width = Math.round(video.videoWidth * ratio)
  canvas.height = Math.round(video.videoHeight * ratio)
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.72)
}

export async function openCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
    audio: false,
  })
  video.srcObject = stream
  await video.play()
  return stream
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}
