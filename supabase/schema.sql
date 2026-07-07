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
