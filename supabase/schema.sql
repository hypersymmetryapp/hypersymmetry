-- Profiles: public username per authenticated user
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Boards: one JSONB blob per user holding their entire idea/goal/task/subtask tree
create table public.boards (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now()
);

alter table public.boards enable row level security;

create policy "Users can manage their own board"
  on public.boards for all using (auth.uid() = user_id);

-- On signup, create the profile (from the username passed in signUp metadata)
-- and an empty board, in the same transaction as the auth.users insert.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'username');

  insert into public.boards (user_id, data)
  values (new.id, '[]'::jsonb);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
