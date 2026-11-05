import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarDateKey, lessonOccursOnDate, lessonsOnDate, freeIntervals } from '../src/data/schedule.ts'

const lesson = (id, start, end, extra = {}) => ({ id, day: 1, startsAt: start, endsAt: end, title: id, type: '', location: '', teacher: '', group: '', color: 'blue', ...extra })

test('dated lessons occur only on their own calendar date, while demo weekday lessons recur', () => {
  const firstMonday = new Date(2026, 10, 2)
  const followingMonday = new Date(2026, 10, 9)
  const dated = lesson('dated', '08:30', '09:50', { date: '2026-11-02', day: 6 })
  const demo = lesson('demo', '10:00', '11:20')
  assert.equal(calendarDateKey(firstMonday), '2026-11-02')
  assert.equal(lessonOccursOnDate(dated, firstMonday), true)
  assert.equal(lessonOccursOnDate(dated, followingMonday), false)
  assert.deepEqual(lessonsOnDate([demo, dated], firstMonday).map(item => item.id), ['dated', 'demo'])
  assert.deepEqual(lessonsOnDate([demo, dated], followingMonday).map(item => item.id), ['demo'])
})

test('parallel lessons and overlaps do not create fake windows', () => {
  const intervals = [lesson('a', '08:30', '10:00'), lesson('subgroup', '08:30', '09:20'), lesson('overlap', '09:30', '10:30'), lesson('b', '10:45', '11:20'), lesson('touching', '11:20', '12:00'), lesson('c', '12:30', '13:00')]
  assert.deepEqual(freeIntervals(intervals), [{ start: '10:30', end: '10:45' }, { start: '12:00', end: '12:30' }])
  assert.deepEqual(freeIntervals([]), [])
  assert.deepEqual(freeIntervals([intervals[0]]), [])
})
