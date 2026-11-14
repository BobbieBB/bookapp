import { roomPath } from '../notifications';

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
});
