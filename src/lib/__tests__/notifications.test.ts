import { isSystemNotice, roomPath, SYSTEM_NOTICES } from '../notifications';

// Where a notification leads (docs/DECISIONS.md, Home; Moderation notices).
describe('roomPath', () => {
  it('a chapter room and the Epilogue', () => {
    expect(roomPath({ story_id: 's1', room_kind: 'chapter', section_number: 4 })).toBe('/room/s1/4');
    expect(roomPath({ story_id: 's1', room_kind: 'epilogue', section_number: null })).toBe('/room/s1/epilogue');
  });

  it('no room (a notice about a review or a reader): nowhere, never /room/null/…', () => {
    expect(roomPath({ story_id: 's1', room_kind: null, section_number: null })).toBeNull();
    expect(roomPath({ story_id: null, room_kind: null, section_number: null })).toBeNull();
    expect(roomPath({ story_id: null, room_kind: 'chapter', section_number: 2 })).toBeNull();
    expect(roomPath({ story_id: 's1', room_kind: 'chapter', section_number: null })).toBeNull();
  });

  it('an account notice has no room either', () => {
    expect(roomPath({ story_id: null, room_kind: null, section_number: null })).toBeNull();
  });
});

// Moderation notices and account notices are one kind of row: system notices (names no one, no link).
describe('isSystemNotice', () => {
  it('covers the moderation and the account notices', () => {
    expect([...SYSTEM_NOTICES].sort()).toEqual(['account_restored', 'account_suspended', 'content_hidden', 'report_resolved']);
    for (const type of SYSTEM_NOTICES) expect(isSystemNotice({ type })).toBe(true);
  });

  it('never a reply, mention or reaction', () => {
    for (const type of ['reply', 'mention', 'reaction'] as const) expect(isSystemNotice({ type })).toBe(false);
  });
});
