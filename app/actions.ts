'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

const HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/

type ClientItem = {
  id: string
  type: string
  parentId?: string | null
  [key: string]: unknown
}

// Create a personal board for the current user if they have none. Idempotent:
// safe to call on every load. Needed for accounts created before the
// multiplayer schema (whose boards were dropped) and as a general safety net
// so a logged-in user is never left board-less (which would loop /app<->/login).
export async function ensureUserBoard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: existing } = await supabase
    .from('board_members')
    .select('board_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (existing) return

  const { data: board, error: boardError } = await supabase
    .from('boards')
    .insert({ owner_id: user.id, name: 'My board' })
    .select('id')
    .single()
  if (boardError) throw boardError

  const { error: memberError } = await supabase
    .from('board_members')
    .insert({ board_id: board.id, user_id: user.id, role: 'owner' })
  if (memberError) throw memberError
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

export async function updateTheme(bgColor: string, panelColor: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!HEX_RE.test(bgColor) || !HEX_RE.test(panelColor)) {
    return { ok: false, error: 'Colors must be hex codes like #000000 or #fff.' }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('profiles')
    .update({ bg_color: bgColor, panel_color: panelColor })
    .eq('id', user.id)
  if (error) throw error

  return { ok: true }
}

export async function requestPasswordReset(origin: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) throw new Error('Not authenticated')

  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${origin}/auth/reset-password`,
  })
  if (error) throw error
}

// Deletes every item on every board the current user OWNS. Boards the user
// merely collaborates on (owned by someone else) are untouched, and the
// boards/memberships themselves survive -- only their contents are cleared.
export async function wipeAccount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: ownedBoards, error: boardsError } = await supabase
    .from('boards')
    .select('id')
    .eq('owner_id', user.id)
  if (boardsError) throw boardsError

  const boardIds = (ownedBoards ?? []).map((b) => b.id)
  if (!boardIds.length) return

  const { error } = await supabase.from('items').delete().in('board_id', boardIds)
  if (error) throw error
}

// Permanently deletes the account. Cascades (via existing FKs) through
// profiles, board_members, and any boards this user owns -- including their
// items and, for shared boards, other members' access to them.
export async function deleteAccount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) throw error

  await supabase.auth.signOut()
  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}
