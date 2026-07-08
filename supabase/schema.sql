-- Reset: drop the old single-user board storage
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.boards cascade;

-- Boards: a shared workspace, owned by one user, editable by any member
create table public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'My board',
  created_at timestamptz default now()
);

-- Board membership: who can see/edit a board, and at what level
create table public.board_members (
  board_id uuid references public.boards(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz default now(),
  primary key (board_id, user_id)
);

-- Items: every idea/goal/task/subtask, one row each, scoped to a board.
-- id/board_id/parent_id/type are real columns (needed for RLS + joins);
-- everything else (name, tags, due, repeat, ...) stays in `fields`, matching
-- the shape the client already produces, so schema changes aren't needed
-- whenever the client adds a new per-type field.
create table public.items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references public.boards(id) on delete cascade not null,
  parent_id uuid references public.items(id) on delete cascade,
  type text not null check (type in ('idea', 'goal', 'task', 'subtask')),
  position integer not null default 0,
  fields jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index items_board_id_idx on public.items(board_id);
create index items_parent_id_idx on public.items(parent_id);
create index board_members_user_id_idx on public.board_members(user_id);

alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.items enable row level security;

-- Membership checks go through security-definer helpers rather than plain
-- subqueries. board_members' own SELECT policy querying board_members
-- directly is self-referential and Postgres reports it as infinite
-- recursion; a security-definer function bypasses RLS for its internal
-- query, breaking the cycle.
create function public.is_board_member(_board_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.board_members
    where board_id = _board_id and user_id = auth.uid()
  );
$$;

create function public.is_board_owner(_board_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.boards
    where id = _board_id and owner_id = auth.uid()
  );
$$;

create policy "Members can view their boards"
  on public.boards for select using (public.is_board_member(id));

create policy "Users can create their own boards"
  on public.boards for insert with check (owner_id = auth.uid());

create policy "Members can view board membership"
  on public.board_members for select using (public.is_board_member(board_id));

create policy "Only the owner can add members"
  on public.board_members for insert with check (public.is_board_owner(board_id));

create policy "Only the owner can remove members"
  on public.board_members for delete using (
    public.is_board_owner(board_id) and user_id <> auth.uid()
  );

create policy "Members can manage items on their boards"
  on public.items for all using (public.is_board_member(board_id));

-- Usernames need to be discoverable so people can be invited by username.
-- profiles never held anything more sensitive than id + username.
drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Any authenticated user can look up a username"
  on public.profiles for select using (auth.role() = 'authenticated');

-- On signup: create the profile, a board owned by the new user, and an
-- owner membership row, all in the same transaction as the auth.users insert.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_board_id uuid;
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'username');

  insert into public.boards (owner_id, name)
  values (new.id, 'My board')
  returning id into new_board_id;

  insert into public.board_members (board_id, user_id, role)
  values (new_board_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Realtime: let clients subscribe to live changes on a board's items
alter publication supabase_realtime add table public.items;

-- Per-user theme prefs. Safe to be user-writable via the existing
-- "update own profile" policy -- purely cosmetic, unlike an admin flag.
alter table public.profiles
  add column bg_color text not null default '#000000',
  add column panel_color text not null default '#ffffff';

-- Owner can rename their boards (projects).
create policy "Owner can rename their boards"
  on public.boards for update using (owner_id = auth.uid());

-- Friends: a symmetric relationship, canonically ordered (user_a < user_b)
-- so each pair has exactly one row regardless of which direction it was
-- created from.
create table public.friendships (
  user_a uuid references auth.users(id) on delete cascade not null,
  user_b uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

alter table public.friendships enable row level security;

create policy "Users can view their own friendships"
  on public.friendships for select using (auth.uid() = user_a or auth.uid() = user_b);

create function public.add_friendship(a uuid, b uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if a = b then return; end if;
  insert into public.friendships (user_a, user_b)
  values (least(a, b), greatest(a, b))
  on conflict do nothing;
end;
$$;

create function public.are_friends(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where user_a = least(a, b) and user_b = greatest(a, b)
  );
$$;

-- Fan-out: joining a board makes you friends with every existing member,
-- regardless of which code path added the membership row (username invite,
-- email invite, self-heal). This keeps "everyone in a project is friends"
-- a DB invariant instead of something every call site has to remember.
create function public.fan_out_friendships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
begin
  for m in
    select user_id from public.board_members
    where board_id = new.board_id and user_id <> new.user_id
  loop
    perform public.add_friendship(new.user_id, m.user_id);
  end loop;
  return new;
end;
$$;

create trigger on_board_member_added
  after insert on public.board_members
  for each row execute function public.fan_out_friendships();

-- Store email on profiles (denormalized from auth.users) so server-side code
-- can look up "does an account with this email exist" without needing the
-- auth schema exposed via PostgREST. Column-level REVOKE keeps this out of
-- reach of the broad "any authenticated user can view any profile" policy
-- above, which is intentionally public for username discovery but must not
-- leak email addresses the same way -- RLS is row-level only, so the policy
-- alone can't restrict this to a single column.
alter table public.profiles add column email text;
update public.profiles p set email = u.email from auth.users u where p.id = u.id;
revoke select (email) on public.profiles from authenticated, anon;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_board_id uuid;
begin
  insert into public.profiles (id, username, email)
  values (new.id, new.raw_user_meta_data->>'username', new.email);

  insert into public.boards (owner_id, name)
  values (new.id, 'My board')
  returning id into new_board_id;

  insert into public.board_members (board_id, user_id, role)
  values (new_board_id, new.id, 'owner');

  return new;
end;
$$;

-- Re-assert the boards INSERT policy: createProject() was hitting
-- "new row violates row-level security policy for table boards" in testing,
-- meaning this policy was missing/stale in the live DB despite being in this
-- file's history. Drop-and-recreate is idempotent and safe to run regardless
-- of current state.
drop policy if exists "Users can create their own boards" on public.boards;
create policy "Users can create their own boards"
  on public.boards for insert with check (owner_id = auth.uid());

-- Root cause of the above: INSERT ... RETURNING also requires the new row to
-- pass the table's SELECT policy (Postgres shows this back to you as the
-- same RLS error, since it can't return a row you're not allowed to see).
-- createProject() inserts the board and asks for `.select('id')` back before
-- the matching board_members owner row exists, so is_board_member(id) was
-- false at that instant and the whole insert was rejected. Let an owner
-- always see their own board regardless of membership rows.
drop policy if exists "Members can view their boards" on public.boards;
create policy "Members can view their boards"
  on public.boards for select using (public.is_board_member(id) or owner_id = auth.uid());

-- Leave/delete project. A member can remove their own board_members row
-- ("leave"); this is a separate permissive policy from the existing
-- "Only the owner can remove members" one, which already excludes
-- user_id = auth.uid() -- so an owner can't leave this way and has to
-- delete the whole project instead, via the boards policy below.
create policy "Members can remove themselves"
  on public.board_members for delete using (user_id = auth.uid());

create policy "Owner can delete their boards"
  on public.boards for delete using (owner_id = auth.uid());
