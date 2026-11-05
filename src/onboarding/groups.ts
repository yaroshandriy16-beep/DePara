import { useCallback, useMemo, useState } from 'react'
import type { UserSelection } from './catalog'

/** A locally saved demo schedule. It is not a change of academic membership. */
export interface SavedGroup {
  id: string
  university: string
  faculty: string
  course: string
  group: string
  universityId?: 'vsau' | 'demo'
  facultyId?: string
  academicGroupId?: string
}

type Snapshot = { owner: string; groups: SavedGroup[]; activeId: string }
const KEY_PREFIX = 'depara-saved-groups-v1:'

export function makeSavedGroup(group: Omit<SavedGroup, 'id'>): SavedGroup {
  return { ...group, id: group.universityId === 'vsau' && group.academicGroupId ? `vsau:group:${group.academicGroupId}` : JSON.stringify([group.university, group.faculty, group.course, group.group]) }
}

function primaryGroup(selection: UserSelection | null): SavedGroup | null {
  if (!selection || selection.role !== 'student' || !selection.university || !selection.faculty || !selection.course || !selection.group) return null
  if (selection.universityId === 'vsau' && (!selection.academicGroupId || !selection.facultyId)) return null
  return makeSavedGroup({ university: selection.university, faculty: selection.faculty, course: selection.course, group: selection.group, universityId: selection.universityId, facultyId: selection.facultyId, academicGroupId: selection.academicGroupId })
}

function load(primary: SavedGroup | null): Snapshot {
  if (!primary) return { owner: '', groups: [], activeId: '' }
  const owner = primary.id
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY_PREFIX + owner) || 'null')
    if (raw && typeof raw === 'object') {
      const value = raw as Partial<Snapshot>
      const unique = new Map<string, SavedGroup>([[primary.id, primary]])
      if (Array.isArray(value.groups)) for (const item of value.groups) {
        if (item && typeof item.university === 'string' && typeof item.faculty === 'string' && typeof item.course === 'string' && typeof item.group === 'string') {
          if (item.universityId === 'vsau' && (!/^\d{1,12}$/.test(item.academicGroupId || '') || !/^\d{1,12}$/.test(item.facultyId || ''))) continue
          const entry = makeSavedGroup(item)
          unique.set(entry.id, entry)
        }
      }
      const groups = [...unique.values()]
      return { owner, groups, activeId: typeof value.activeId === 'string' && unique.has(value.activeId) ? value.activeId : primary.id }
    }
  } catch { /* Storage may be unavailable or invalid. */ }
  return { owner, groups: [primary], activeId: primary.id }
}

function persist(snapshot: Snapshot) {
  if (!snapshot.owner) return
  try { localStorage.setItem(KEY_PREFIX + snapshot.owner, JSON.stringify(snapshot)) } catch { /* Use in-memory selection. */ }
}

export function useSavedGroups(selection: UserSelection | null) {
  const primary = useMemo(() => primaryGroup(selection), [selection])
  const [saved, setSaved] = useState<Snapshot>(() => load(primary))
  // Treat a changed onboarding selection as a different account immediately, without
  // leaking the previous user's selected schedule for one render.
  const snapshot = useMemo(() => saved.owner === (primary?.id || '') ? saved : load(primary), [saved, primary])
  const selectGroup = useCallback((id: string) => {
    if (!snapshot.groups.some(group => group.id === id)) return
    const next = { ...snapshot, activeId: id }
    persist(next); setSaved(next)
  }, [snapshot])
  const addGroup = useCallback((group: SavedGroup) => {
    const normalized = makeSavedGroup(group)
    const exists = snapshot.groups.some(item => item.id === normalized.id)
    const next = { ...snapshot, groups: exists ? snapshot.groups : [...snapshot.groups, normalized], activeId: normalized.id }
    persist(next); setSaved(next)
  }, [snapshot])
  return { groups: snapshot.groups, activeGroup: snapshot.groups.find(item => item.id === snapshot.activeId) || null, selectGroup, addGroup }
}
