import { useEffect, useState } from 'react'
import { vnauOptions, type VnauOption } from '../data/vnauApi'

type Stage = 'faculty' | 'course' | 'group' | 'teacher' | 'idle'
export function useVnauCatalog(enabled: boolean, stage: Stage, facultyId: string, course: string, query: string) {
  const [options, setOptions] = useState<VnauOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let current = true
    setOptions([]); setError('')
    if (!enabled || stage === 'idle' || (stage === 'teacher' && query.trim().length < 2)) { setLoading(false); return () => { current = false } }
    setLoading(true)
    const run = async () => {
      try {
        const result = stage === 'faculty' ? await vnauOptions('/api/vnau/faculties', 'faculties')
          : stage === 'course' ? await vnauOptions(`/api/vnau/faculties/${encodeURIComponent(facultyId)}/courses`, 'courses')
          : stage === 'group' ? await vnauOptions(`/api/vnau/faculties/${encodeURIComponent(facultyId)}/courses/${encodeURIComponent(course)}/groups`, 'groups')
          : await vnauOptions('/api/vnau/teachers', 'teachers', { query: query.trim() })
        if (current) setOptions(result)
      } catch (cause) {
        if (current) setError(cause instanceof Error ? cause.message : 'Сервіс ВНАУ тимчасово недоступний.')
      } finally { if (current) setLoading(false) }
    }
    const timer = window.setTimeout(() => { void run() }, stage === 'teacher' ? 500 : 0)
    return () => { current = false; window.clearTimeout(timer) }
  }, [enabled, stage, facultyId, course, query, revision])
  return { options, loading, error, retry: () => setRevision(value => value + 1) }
}
