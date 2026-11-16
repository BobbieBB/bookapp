// What a story's sections are called (docs/DECISIONS.md, "PO testing round on iPhone", E): chapters, or
// for a book, parts or acts. Books with no division use 25-page parts. Each word has its own sentences,
// because Bulgarian agrees with it („Прочетена глава“, „Прочетено действие“).
import type { MessageKey } from '../i18n/en';
import type { Story } from './types';

export type SectionLabel = 'chapter' | 'part' | 'act';

export function sectionLabel(s: Pick<Story, 'has_chapters' | 'section_label'>): SectionLabel {
  if (!s.has_chapters) return 'part';
  return s.section_label === 'part' || s.section_label === 'act' ? s.section_label : 'chapter';
}

type Words = Record<SectionLabel, MessageKey>;

/** "Chapter 3", "Part 3", "Act 3": a room's name. */
export const ROOM_NAME: Words = { chapter: 'room.chapter', part: 'room.part', act: 'room.act' };
/** "I finished chapter 3" on the story page. */
export const FINISH: Words = { chapter: 'story.finishChapter', part: 'story.finishPart', act: 'story.finishAct' };
/** The same in a room still closed to you. */
export const FINISH_PILL: Words = { chapter: 'room.finishedPill', part: 'room.finishedPillPart', act: 'room.finishedPillAct' };
/** "Finish chapter 3 to join this discussion." */
export const LOCKED_ROOM: Words = { chapter: 'room.lockedChapter', part: 'room.lockedPart', act: 'room.lockedAct' };
/** "Finish chapter 3 to open" on a locked row. */
export const LOCKED_ROW: Words = { chapter: 'story.roomLocked', part: 'story.roomLockedPart', act: 'story.roomLockedAct' };
/** A row on the wheel. */
export const OPTION: Words = { chapter: 'story.chapterOption', part: 'story.partOption', act: 'story.actOption' };
/** "Finished chapter 3 of 10" / "Finished chapter 3". */
export const FINISHED_OF: Words = { chapter: 'library.finishedChapterOf', part: 'library.finishedPartOf', act: 'library.finishedActOf' };
export const FINISHED: Words = { chapter: 'library.finishedChapter', part: 'library.finishedPart', act: 'library.finishedAct' };
