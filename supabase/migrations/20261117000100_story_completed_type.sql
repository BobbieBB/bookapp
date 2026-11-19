-- "[Fic] is complete. The Epilogue is open." (docs/DECISIONS.md, "Finishing a WIP fic", 20 Oct 2026).
-- The new kind on its own: a value added to an enum can't be used in the same transaction, and the next
-- migration inserts it.
alter type public.notification_type add value if not exists 'story_completed';
