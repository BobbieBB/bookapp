import { threadComments, visibleReplies, type Comment } from '../discussions';

let t = 0;
const c = (id: string, parent: string | null = null): Comment => ({
  id,
  parent_id: parent,
  body: id,
  created_at: new Date(Date.UTC(2026, 9, 16, 0, 0, t++)).toISOString(),
  edited_at: null,
  deleted_at: null,
  author: { id: 'u', username: 'u' },
  reactions: [],
});

describe('threadComments', () => {
  it('groups replies under their comment, oldest first', () => {
    const a = c('a');
    const b = c('b');
    const a1 = c('a1', 'a');
    const a2 = c('a2', 'a');
    expect(threadComments([a2, b, a1, a])).toEqual([
      { comment: a, replies: [a1, a2] },
      { comment: b, replies: [] },
    ]);
  });

  it('leaves out replies to a comment you cannot see (e.g. by someone you blocked)', () => {
    expect(threadComments([c('orphan', 'gone'), c('x')]).map((th) => th.comment.id)).toEqual(['x']);
  });
});

// docs/DECISIONS.md, Visual design: long threads show the last 2 replies + "View N earlier replies".
describe('visibleReplies', () => {
  const replies = ['r1', 'r2', 'r3', 'r4', 'r5'].map((id) => c(id, 'p'));

  it('shows only the last 2 replies of a long thread', () => {
    const v = visibleReplies(replies, false);
    expect(v.shown.map((r) => r.id)).toEqual(['r4', 'r5']);
    expect(v.earlier).toBe(3);
  });

  it('shows everything once expanded', () => {
    expect(visibleReplies(replies, true)).toEqual({ shown: replies, earlier: 0 });
  });

  it('short threads are shown in full', () => {
    expect(visibleReplies(replies.slice(0, 2), false)).toEqual({ shown: replies.slice(0, 2), earlier: 0 });
  });
});
