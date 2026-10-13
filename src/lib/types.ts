// Shapes of the rows the app reads. They mirror supabase/migrations.

export type StoryKind = 'book' | 'fanfic';
export type LibraryStatus = 'currently_reading' | 'want_to_read' | 'finished' | 'dnf' | 'on_hold';

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  reads_books: boolean;
  reads_fanfic: boolean;
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

export const STATUS_LABEL: Record<LibraryStatus, string> = {
  currently_reading: 'Currently Reading',
  want_to_read: 'Want to Read',
  finished: 'Finished',
  dnf: 'DNF',
  on_hold: 'On Hold',
};
