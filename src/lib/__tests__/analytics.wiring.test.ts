import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..', '..');
const source = (file: string) => readFileSync(join(root, file), 'utf8');

const wiring: [string, string, string][] = [
  ['app_open', 'app/_layout.tsx', "track('app_open'"],
  // sign_up is sent from onboarding: before the profile and the reader's consent exist, nothing may be sent.
  ['sign_up', 'app/onboarding.tsx', "track('sign_up'"],
  ['onboarding_done', 'app/onboarding.tsx', "track('onboarding_done'"],
  ['story_added', 'app/add.tsx', "track('story_added'"],
  ['chapter_finished', 'app/story/[id].tsx', "track('chapter_finished'"],
  ['chapter_finished (room)', 'app/room/[storyId]/[room].tsx', "track('chapter_finished'"],
  ['story_finished', 'app/story/[id].tsx', "track('story_finished'"],
  ['comment_posted', 'app/room/[storyId]/[room].tsx', "track('comment_posted'"],
  ['reaction_added', 'app/room/[storyId]/[room].tsx', "track('reaction_added'"],
  ['room_opened', 'app/room/[storyId]/[room].tsx', "track('room_opened'"],
  ['discover_opened', 'app/(tabs)/discover.tsx', "track('discover_opened'"],
  ['feedback_sent', 'app/feedback.tsx', "track('feedback_sent'"],
  ['language_changed', 'app/(tabs)/profile.tsx', "track('language_changed'"],
  ['cover_set', 'src/components/CustomCover.tsx', "track('cover_set'"],
];

describe('analytics wiring', () => {
  it('sign-up itself sends nothing', () => {
    expect(source('app/sign-in.tsx')).not.toContain('track(');
  });

  test.each(wiring)('%s is tracked in %s', (_event, file, call) => {
    expect(source(file)).toContain(call);
  });
});
