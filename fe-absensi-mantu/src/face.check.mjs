import assert from 'node:assert/strict'
import { attendanceEventKey, bestMatch, faceMatchScore, faceQuality, median } from './face.js'

const query = new Float32Array([0, 0, 0])
const profiles = [
  { student_id: 'student-a', descriptors: [[0.05, 0, 0], [0.06, 0, 0], [0.07, 0, 0]] },
  { student_id: 'student-b', descriptors: [[0.3, 0, 0], [0.31, 0, 0], [0.32, 0, 0]] },
]
const match = bestMatch(query, profiles)

assert.equal(match.student_id, 'student-a')
assert.ok(match.distance > 0.05 && match.distance < 0.07)
assert.ok(match.gap > 0.2)
assert.equal(median([0.34, 0.29, 0.32]), 0.32)
assert.equal(faceMatchScore(0, 0.5), 100)
assert.equal(faceMatchScore(0.5, 0.5), 70)
assert.equal(faceMatchScore(0.325, 0.5), 80.5)
assert.equal(faceQuality({ detection: { score: 0.9, box: { x: 100, width: 300 } } }, { videoWidth: 1000 }), '')
assert.match(faceQuality({ detection: { score: 0.9, box: { x: 100, width: 100 } } }, { videoWidth: 1000 }), /terlalu jauh/)
const completedEvents = new Set([attendanceEventKey('entry', 'student-a')])
assert.equal(completedEvents.has(attendanceEventKey('entry', 'student-a')), true)
assert.equal(completedEvents.has(attendanceEventKey('exit', 'student-a')), false)

console.log('Face matching and quality checks passed.')
