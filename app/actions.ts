'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

const HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

export async function createProject(name: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const trimmed = name.trim().slice(0, 60) || 'New project'
  const { data: board, error: boardError } = await supabase
    .from('boards')
    .insert({ owner_id: user.id, name: trimmed })
    .select('id')
    .single()
  if (boardError) return { ok: false, error: boardError.message }

  const { error: memberError } = await supabase
    .from('board_members')
    .insert({ board_id: board.id, user_id: user.id, role: 'owner' })
  if (memberError) return { ok: false, error: memberError.message }

  return { ok: true, id: board.id }
}

export async function renameProject(boardId: string, name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = name.trim().slice(0, 60)
  if (!trimmed) return { ok: false, error: 'Name cannot be empty.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('boards').update({ name: trimmed }).eq('id', boardId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

type AssigneeResolution =
  | { status: 'ok'; userId: string; username: string }
  | { status: 'needs_confirmation'; userId: string; username: string }
  | { status: 'needs_invite'; email: string }
  | { status: 'not_found' }

async function generateUsername(admin: ReturnType<typeof createAdminClient>, email: string) {
  const base = (email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || 'user').padEnd(3, '0')
  let candidate = base
  let suffix = 0
  for (;;) {
    const { data } = await admin.from('profiles').select('id').eq('username', candidate).maybeSingle()
    if (!data) return candidate
    suffix += 1
    candidate = `${base}${suffix}`.slice(0, 20)
  }
}

// A friend already, or already a member of this board -- either way, safe to
// attach as an assignee outright. Ensures board membership if they're a
// friend from elsewhere but not yet on this specific board (silent, since
// spam-prevention only applies to non-friends, and they've already cleared
// that bar). Otherwise flags that the caller needs to confirm first.
async function resolveKnownUser(
  meId: string,
  theirId: string,
  username: string,
  boardId: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<AssigneeResolution> {
  if (meId === theirId) return { status: 'ok', userId: theirId, username }

  const { data: friends } = await admin.rpc('are_friends', { a: meId, b: theirId })
  if (!friends) return { status: 'needs_confirmation', userId: theirId, username }

  const { error } = await admin.from('board_members').insert({ board_id: boardId, user_id: theirId, role: 'editor' })
  if (error && !/duplicate key/i.test(error.message)) throw error
  return { status: 'ok', userId: theirId, username }
}

// Resolves an @token typed in a task to a real account, without blocking
// task creation -- the caller attaches the assignee once this returns.
export async function resolveAssignee(boardId: string, token: string): Promise<AssigneeResolution> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = createAdminClient()

  if (EMAIL_RE.test(token)) {
    const { data: existing } = await admin.from('profiles').select('id, username').eq('email', token).maybeSingle()
    if (!existing) return { status: 'needs_invite', email: token }
    return resolveKnownUser(user.id, existing.id, existing.username, boardId, admin)
  }

  const { data: profile } = await supabase.from('profiles').select('id, username').eq('username', token).maybeSingle()
  if (!profile) return { status: 'not_found' }
  return resolveKnownUser(user.id, profile.id, profile.username, boardId, admin)
}

// Called after the user answers "send friend request?" / "invite them?" with
// yes. Both cases resolve to the same action: add them to this project,
// which fans out friendship to every existing member via the DB trigger.
export async function confirmAssignee(
  boardId: string,
  origin: string,
  input: { userId: string } | { email: string }
): Promise<{ ok: true; userId: string; username: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user: me } } = await supabase.auth.getUser()
  if (!me) throw new Error('Not authenticated')
  const admin = createAdminClient()

  let userId: string
  let username: string

  if ('email' in input) {
    const placeholder = await generateUsername(admin, input.email)
    const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
      data: { username: placeholder, invited_by: me.id },
      redirectTo: `${origin}/auth/accept-invite`,
    })
    if (error || !data?.user) return { ok: false, error: error?.message || 'Could not send invite.' }
    userId = data.user.id
    username = placeholder
  } else {
    userId = input.userId
    const { data: profile } = await admin.from('profiles').select('username').eq('id', userId).maybeSingle()
    username = profile?.username ?? ''
  }

  const { error: memberError } = await admin.from('board_members').insert({ board_id: boardId, user_id: userId, role: 'editor' })
  if (memberError && !/duplicate key/i.test(memberError.message)) return { ok: false, error: memberError.message }

  return { ok: true, userId, username }
}

// Every task assigned to the current user across every project they belong
// to, for the Home rollup. Filtered in JS rather than a JSONB containment
// query -- simpler and plenty fast at this scale.
export async function listAssignedToMe() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const boards = await listMyBoards()
  if (!boards.length) return []

  const { data: rows, error } = await supabase
    .from('items')
    .select('id, type, parent_id, board_id, fields')
    .in('board_id', boards.map((b) => b.id))
    .in('type', ['task', 'subtask'])
  if (error) throw error

  const projectName = new Map(boards.map((b) => [b.id, b.isOwn ? b.name : `${b.ownerUsername}'s board`]))
  const ownedBoardIds = new Set(boards.filter((b) => b.isOwn).map((b) => b.id))

  const matchedTasks = (rows ?? []).filter((r) => {
    if (r.type !== 'task') return false
    const ids = (r.fields as { assigneeIds?: unknown })?.assigneeIds
    if (Array.isArray(ids) && ids.length) return ids.includes(user.id)
    // Unassigned tasks default to the owner of the board they're on --
    // preserves plain solo use (nobody ever sets an assignee) without
    // every unassigned task on a shared project also showing up for
    // every collaborator.
    return ownedBoardIds.has(r.board_id)
  })
  const matchedIds = new Set(matchedTasks.map((r) => r.id))
  // Subtasks aren't independently assigned -- pull in whichever ones belong
  // to a task that made the cut above, so the rollup can show/edit them the
  // same way the per-project checklist does.
  const matchedSubtasks = (rows ?? []).filter((r) => r.type === 'subtask' && r.parent_id && matchedIds.has(r.parent_id))

  return [...matchedTasks, ...matchedSubtasks].map((r) => ({
    id: r.id,
    type: r.type,
    parentId: r.parent_id,
    // boardId/projectName also get persisted into `fields` client-side (so
    // syncItems has everything it needs for a new row), but the computed
    // values here must win on every fetch -- otherwise a renamed project
    // would leave old rollup rows showing the stale name forever.
    ...(r.fields as Record<string, unknown>),
    boardId: r.board_id,
    projectName: projectName.get(r.board_id) ?? '',
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
