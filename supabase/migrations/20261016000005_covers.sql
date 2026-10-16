-- Private custom covers (docs/DECISIONS.md, "Custom covers", 14 Oct 2026): a reader can upload a
-- cover for a story in their library that only they ever see. Files live in a private bucket under
-- a folder named after the reader; nobody else can list, read, change or delete them.

-- Which file is your cover for a story. Its own table, readable only by you: library entries can be
-- visible to other readers, and the path must not be.
create table public.custom_covers (
  user_id    uuid not null default auth.uid(),
  story_id   uuid not null,
  path       text not null check (path like user_id::text || '/%' and char_length(path) <= 300 and path !~ '\.\.'),
  updated_at timestamptz not null default now(),
  primary key (user_id, story_id),
  -- only for a story in your library; removing it from your library removes the cover choice
  foreign key (user_id, story_id) references public.library_entries (user_id, story_id) on delete cascade
);
alter table public.custom_covers enable row level security;
grant select, insert, update, delete on public.custom_covers to authenticated;
create policy custom_covers_own on public.custom_covers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_active_user());

-- Supabase Storage only exists on Supabase (not in the plain-Postgres test database).
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('covers', 'covers', false, 5 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    execute $p$
      create policy covers_owner_read on storage.objects for select to authenticated
        using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy covers_owner_insert on storage.objects for insert to authenticated
        with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy covers_owner_update on storage.objects for update to authenticated
        using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text)
        with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy covers_owner_delete on storage.objects for delete to authenticated
        using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
  end if;
end $do$;
