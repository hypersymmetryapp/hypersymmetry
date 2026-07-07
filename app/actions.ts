'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type ClientItem = {
  id: string
  type: string
  parentId?: string | null
  [key: string]: unknown
}

export async function syncItems(boardId: string, upserts: ClientItem[], deleteIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (upserts.length) {
    const rows = upserts.map(({ id, type, parentId, ...fields }) => ({
      id,
      board_id: boardId,
      type,
      parent_id: parentId ?? null,
      fields,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase.from('items').upsert(rows)
    if (error) throw error
  }

  if (deleteIds.length) {
    const { error } = await supabase.from('items').delete().in('id', deleteIds)
    if (error) throw error
  }
}

export async function inviteToBoard(boardId: string, username: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile, error: lookupError } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  if (lookupError) throw lookupError
  if (!profile) return { ok: false, error: `No user found with username "${username}"` }

  const { error } = await supabase
    .from('board_members')
    .insert({ board_id: boardId, user_id: profile.id, role: 'editor' })
  if (error) {
    if (/duplicate key/i.test(error.message)) return { ok: false, error: 'That person is already a member of this board.' }
    throw error
  }

  return { ok: true }
}

export async function listMyBoards() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: memberships, error } = await supabase
    .from('board_members')
    .select('role, boards(id, name, owner_id)')
    .eq('user_id', user.id)
  if (error) throw error

  type Membership = { role: string; boards: { id: string; name: string; owner_id: string } | null }
  const rows = (memberships ?? []) as unknown as Membership[]

  const ownerIds = Array.from(new Set(rows.map((m) => m.boards?.owner_id).filter(Boolean))) as string[]
  const { data: owners } = ownerIds.length
    ? await supabase.from('profiles').select('id, username').in('id', ownerIds)
    : { data: [] as { id: string; username: string }[] }
  const ownerUsername = new Map((owners ?? []).map((o) => [o.id, o.username]))

  return rows
    .filter((m): m is Membership & { boards: NonNullable<Membership['boards']> } => !!m.boards)
    .map((m) => ({
      id: m.boards.id,
      name: m.boards.name,
      role: m.role,
      ownerUsername: ownerUsername.get(m.boards.owner_id) ?? '',
      isOwn: m.boards.owner_id === user.id,
    }))
}

export async function listBoardMembers(boardId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: members, error } = await supabase
    .from('board_members')
    .select('user_id, role')
    .eq('board_id', boardId)
  if (error) throw error

  const userIds = (members ?? []).map((m) => m.user_id)
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, username').in('id', userIds)
    : { data: [] as { id: string; username: string }[] }
  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]))

  return (members ?? []).map((m) => ({
    userId: m.user_id,
    role: m.role,
    username: usernameById.get(m.user_id) ?? '(unknown)',
  }))
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}
