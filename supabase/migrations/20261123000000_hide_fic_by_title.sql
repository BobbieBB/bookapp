-- Asking to hide a fic needs only its title and the author's name (PO, 23 Nov 2026): no AO3 link and no
-- contact details. A recent scandal with another app made authors wary of handing them over. The PO checks
-- each request by hand and replies to the e-mail address of the requester's Livami account.
-- Older requests keep their link and contact.

alter table public.removal_requests
  add column fic_title text check (char_length(trim(fic_title)) between 1 and 300),
  add column fic_author text check (char_length(trim(fic_author)) between 1 and 200),
  drop constraint if exists removal_contact,
  drop constraint if exists removal_requests_check,
  add constraint removal_what check (story_id is not null or story_url is not null or fic_title is not null);

-- ---------------------------------------------------------------------------
-- Moderation: the queue shows the title and author name given, and the account's e-mail address to reply
-- to when no contact was typed. Hide finds the fic by its title and author when exactly one matches.
-- ---------------------------------------------------------------------------
create or replace function public.moderation_queue()
returns table (
  kind text, id uuid, created_at timestamptz,
  story_id uuid, story_title text, subject text, excerpt text, reason text, details text,
  contact text, story_url text, current_count int, proposed_count int, reporter_count int,
  subject_id uuid, subject_suspended boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can see the moderation queue' using errcode = '42501';
  end if;

  return query
  select q.* from (
    select 'comment_report'::text, r.id, r.created_at,
           d.story_id, s.title, p.username,
           left(c.body, 280) || case when char_length(c.body) > 280 then '…' else '' end,
           r.reason::text, r.details, null::text, null::text, null::int, null::int,
           (select count(*)::int from public.reports o where o.comment_id = r.comment_id and o.status = 'open'),
           p.id as subject_id, p.is_suspended as subject_suspended
    from public.reports r
    join public.comments c on c.id = r.comment_id
    join public.discussions d on d.id = c.discussion_id
    join public.stories s on s.id = d.story_id
    left join public.profiles p on p.id = c.author_id
    where r.status = 'open'
    union all
    select 'review_report', r.id, r.created_at,
           v.story_id, s.title, p.username,
           left(v.body, 280) || case when char_length(v.body) > 280 then '…' else '' end,
           r.reason::text, r.details, null, null, null, null,
           (select count(*)::int from public.reports o where o.review_id = r.review_id and o.status = 'open'),
           p.id as subject_id, p.is_suspended as subject_suspended
    from public.reports r
    join public.reviews v on v.id = r.review_id
    join public.stories s on s.id = v.story_id
    left join public.profiles p on p.id = v.user_id
    where r.status = 'open'
    union all
    select 'user_report', r.id, r.created_at,
           null::uuid, null::text, p.username, null::text,
           r.reason::text, r.details, null, null, null, null,
           (select count(*)::int from public.reports o where o.reported_user_id = r.reported_user_id and o.status = 'open'),
           p.id as subject_id, p.is_suspended as subject_suspended
    from public.reports r
    join public.profiles p on p.id = r.reported_user_id
    where r.status = 'open'
    union all
    select 'removal_request', q.id, q.created_at,
           q.story_id, coalesce(s.title, q.fic_title), q.fic_author,
           left(q.message, 280) || case when char_length(q.message) > 280 then '…' else '' end,
           null::text, null::text, coalesce(q.contact, u.email::text), coalesce(q.story_url, s.source_url), null, null, null,
           null::uuid, null::boolean
    from public.removal_requests q
    left join public.stories s on s.id = q.story_id
    left join auth.users u on u.id = q.requester_id
    where q.status = 'open'
    union all
    select 'feedback', f.id, f.created_at,
           null::uuid, null::text, null::text,
           left(f.body, 280) || case when char_length(f.body) > 280 then '…' else '' end,
           f.kind, null, null, null, null, null, null,
           null::uuid, null::boolean
    from public.feedback f
    where f.status = 'open'
    union all
    select 'chapter_count', x.id, x.created_at,
           x.story_id, s.title, p.username, null::text,
           null::text, null::text, null::text, null::text, s.total_sections, x.proposed, null::int,
           null::uuid, null::boolean
    from public.chapter_count_requests x
    join public.stories s on s.id = x.story_id
    left join public.profiles p on p.id = x.requester_id
    where x.status = 'open'
  ) q
  order by q.created_at desc, q.id;
end $$;

revoke execute on function public.moderation_queue() from public, anon;
grant execute on function public.moderation_queue() to authenticated;

create or replace function public.moderation_resolve(p_kind text, p_id uuid, p_action text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  outcome constant public.report_status := case when p_action = 'dismiss' then 'dismissed' else 'actioned' end;
  rep public.reports;
  rem public.removal_requests;
  req public.chapter_count_requests;
  fb public.feedback;
  s public.stories;
  matched uuid;
  target_kind text;
  target_story uuid;
  target_room uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins can resolve moderation items' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('comment_report', 'review_report', 'user_report', 'removal_request', 'chapter_count', 'feedback') then
    raise exception 'unknown moderation kind: %', coalesce(p_kind, '<none>') using errcode = '22023';
  end if;
  if p_action is null or not (p_action = any (case p_kind
       when 'comment_report' then array['hide', 'dismiss']
       when 'review_report' then array['hide', 'dismiss']
       when 'user_report' then array['dismiss']
       when 'removal_request' then array['hide', 'dismiss']
       when 'chapter_count' then array['accept', 'dismiss']
       else array['done', 'dismiss'] end)) then
    raise exception '% cannot be %', p_kind, coalesce(p_action, '<none>') using errcode = '22023';
  end if;

  if p_kind in ('comment_report', 'review_report', 'user_report') then
    select * into rep from public.reports
     where id = p_id
       and case p_kind when 'comment_report' then comment_id is not null
                       when 'review_report' then review_id is not null
                       else reported_user_id is not null end
     for update;
    if rep.id is null then
      raise exception 'moderation item not found' using errcode = 'P0002';
    end if;
    if rep.status <> 'open' then
      raise exception 'this item is already resolved' using errcode = '55000';
    end if;

    -- Where the reported thing lives, for both notices: the comment's story and room, the review's story.
    if p_kind = 'comment_report' then
      target_kind := 'comment';
      select c.discussion_id, d.story_id into target_room, target_story
        from public.comments c join public.discussions d on d.id = c.discussion_id where c.id = rep.comment_id;
    elsif p_kind = 'review_report' then
      target_kind := 'review';
      select v.story_id into target_story from public.reviews v where v.id = rep.review_id;
    else
      target_kind := 'reader';
    end if;

    if p_action = 'hide' then
      -- The author is told once, when the item is actually hidden (not again if it already was), and not
      -- about a comment they had deleted themselves (it is still hidden, in case it is ever restored).
      if p_kind = 'comment_report' then
        with h as (update public.comments set is_hidden = true where id = rep.comment_id and not is_hidden returning author_id, deleted_at)
        insert into public.notifications (user_id, type, discussion_id, story_id, content_kind, reason)
        select h.author_id, 'content_hidden', target_room, target_story, target_kind, rep.reason
        from h where h.author_id is not null and h.deleted_at is null;
      else
        with h as (update public.reviews set is_hidden = true where id = rep.review_id and not is_hidden returning user_id)
        insert into public.notifications (user_id, type, story_id, content_kind, reason)
        select h.user_id, 'content_hidden', target_story, target_kind, rep.reason from h;
      end if;
      with closed as (
        update public.reports set status = 'actioned'
         where status = 'open'
           and case p_kind when 'comment_report' then comment_id = rep.comment_id else review_id = rep.review_id end
        returning reporter_id
      )
      insert into public.notifications (user_id, type, discussion_id, story_id, content_kind, outcome)
      select reporter_id, 'report_resolved', target_room, target_story, target_kind, 'actioned' from closed;
    else
      update public.reports set status = outcome where id = rep.id;
      insert into public.notifications (user_id, type, discussion_id, story_id, content_kind, outcome)
      values (rep.reporter_id, 'report_resolved', target_room, target_story, target_kind, outcome);
    end if;

  elsif p_kind = 'removal_request' then
    select * into rem from public.removal_requests where id = p_id for update;
    if rem.id is null then
      raise exception 'moderation item not found' using errcode = 'P0002';
    end if;
    if rem.status <> 'open' then
      raise exception 'this item is already resolved' using errcode = '55000';
    end if;
    if p_action = 'hide' then
      matched := rem.story_id;
      if matched is null then
        select id into matched from public.stories where lower(source_url) = lower(rem.story_url);
      end if;
      if matched is null and rem.story_url is null and rem.fic_title is not null then
        -- Only the title and author name the author gave: hide the fic only when exactly one matches.
        select (array_agg(f.id))[1] into matched
        from public.stories f
        where f.kind = 'fanfic'
          and lower(trim(f.title)) = lower(trim(rem.fic_title))
          and (rem.fic_author is null or lower(trim(f.author_name)) = lower(trim(rem.fic_author)))
        having count(*) = 1;
      end if;
      if matched is null then
        raise exception 'no single fic in the app matches this request: hide it by hand, then dismiss the request' using errcode = 'MD001';
      end if;
      update public.stories set is_hidden = true, updated_at = now() where id = matched;
      update public.removal_requests set story_id = matched, status = 'actioned' where id = rem.id;
    else
      update public.removal_requests set status = 'dismissed' where id = rem.id;
    end if;

  elsif p_kind = 'chapter_count' then
    select * into req from public.chapter_count_requests where id = p_id for update;
    if req.id is null then
      raise exception 'moderation item not found' using errcode = 'P0002';
    end if;
    if req.status <> 'open' then
      raise exception 'this item is already resolved' using errcode = '55000';
    end if;
    if p_action = 'accept' then
      select * into s from public.stories where id = req.story_id for update;
      if s.kind <> 'book' or not s.has_chapters or s.total_sections is null
         or (s.published_sections is not null and req.proposed < s.published_sections) then
        raise exception 'this book cannot take that chapter count' using errcode = 'MD002';
      end if;
      update public.stories set total_sections = req.proposed, updated_at = now() where id = s.id;
      update public.library_entries
         set progress_section = case when status = 'finished' then req.proposed else least(progress_section, req.proposed) end
       where story_id = s.id
         and ((status = 'finished' and progress_section <> req.proposed) or progress_section > req.proposed);
      -- the same proposal from other readers is answered too; different ones stay for a moderator
      update public.chapter_count_requests set status = 'actioned'
       where story_id = s.id and status = 'open' and proposed = req.proposed;
    else
      update public.chapter_count_requests set status = 'dismissed' where id = req.id;
    end if;

  else
    select * into fb from public.feedback where id = p_id for update;
    if fb.id is null then
      raise exception 'moderation item not found' using errcode = 'P0002';
    end if;
    if fb.status <> 'open' then
      raise exception 'this item is already resolved' using errcode = '55000';
    end if;
    update public.feedback set status = outcome where id = fb.id;
  end if;
end $$;
revoke execute on function public.moderation_resolve(text, uuid, text) from public, anon;
grant execute on function public.moderation_resolve(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The e-mail to the PO: title and author name given, the link if there is one, and where to reply.
-- ---------------------------------------------------------------------------
create or replace function public.removal_requests_send_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  story text;
  link text;
  reply_to text;
begin
  begin
    select s.title, s.source_url into story, link from public.stories s where s.id = new.story_id;
    select u.email::text into reply_to from auth.users u where u.id = new.requester_id;
    perform public.send_moderation_email(
      '[Livami] Author removal request',
      concat_ws(E'\n',
        'An author asks for their fic to be hidden.',
        case when coalesce(new.fic_title, story) is not null then 'Fic: ' || public.moderation_email_clean(coalesce(new.fic_title, story)) end,
        case when new.fic_author is not null then 'Author name: ' || public.moderation_email_clean(new.fic_author) end,
        case when story is not null and new.fic_title is not null then 'Matched in the app: ' || public.moderation_email_clean(story) end,
        case when coalesce(new.story_url, link) is not null then 'Link: ' || public.moderation_email_clean(coalesce(new.story_url, link)) end,
        'Reply to: ' || public.moderation_email_clean(coalesce(new.contact, reply_to, 'unknown')),
        case when nullif(public.moderation_email_clean(new.message), '') is not null
             then 'Message: ' || left(public.moderation_email_clean(new.message), 500) end,
        '',
        'Check it by hand and reply. Open Moderation in the app to hide the fic or dismiss the request.'),
      'removal');
  exception when others then
    raise warning 'e-mail for removal request % not sent (%)', new.id, sqlstate;
  end;
  return new;
end $$;
revoke execute on function public.removal_requests_send_email() from public, anon, authenticated, service_role;
