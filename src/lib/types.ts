// Shapes of the rows the app reads. They mirror supabase/migrations.
import type { MessageKey } from '../i18n/en';

export type StoryKind = 'book' | 'fanfic';
export type LibraryStatus = 'currently_reading' | 'want_to_read' | 'finished' | 'dnf' | 'on_hold';

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  reads_books: boolean;
  reads_fanfic: boolean;
  is_admin: boolean; // sees Profile > Numbers (set only in the database)
};

export type Story = {
  id: string;
  kind: StoryKind;
  title: string;
  author_name: string;
  fandoms: string[];
  ships: string[];
  has_chapters: boolean;
  published_sections: number | null;
  total_sections: number | null;
  page_count: number | null;
  status: 'completed' | 'ongoing' | null;
  source_url: string | null;
};

export type LibraryEntry = {
  story_id: string;
  status: LibraryStatus;
  is_favourite: boolean;
  progress_section: number;
  progress_page: number | null;
  updated_at: string;
  story: Story;
};

/** The translation key of each status's name (shown on chips and rows). */
export const STATUS_KEY = {
  currently_reading: 'library.status.currently_reading',
  want_to_read: 'library.status.want_to_read',
  finished: 'library.status.finished',
  dnf: 'library.status.dnf',
  on_hold: 'library.status.on_hold',
} as const satisfies Record<LibraryStatus, MessageKey>;
