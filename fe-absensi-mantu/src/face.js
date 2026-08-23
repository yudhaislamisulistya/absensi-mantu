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
    })
  }
  return faceApiPromise
}

export async function detectFace(video) {
  const faceapi = await loadFaceModels()
  return faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 }))
    .withFaceLandmarks()
    .withFaceDescriptor()
}

export function bestMatch(descriptor, profiles) {
  let best = null
  for (const profile of profiles) {
    for (const saved of profile.descriptors || []) {
      if (!Array.isArray(saved) || saved.length !== descriptor.length) continue
      let squared = 0
      for (let index = 0; index < descriptor.length; index += 1) {
        squared += (descriptor[index] - saved[index]) ** 2
      }
      const distance = Math.sqrt(squared)
      if (!best || distance < best.distance) best = { ...profile, distance }
    }
  }
  return best
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
    video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
    audio: false,
  })
  video.srcObject = stream
  await video.play()
  return stream
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}
