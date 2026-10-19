// The PO's weekly numbers (docs/DECISIONS.md, "Analytics"), for admins only: admin_numbers refuses
// everyone else. Counted from analytics events alone, so readers who opted out are never in them.
import { supabase } from './supabase';

export type WeekNumbers = {
  week: string; // the Monday the week starts on (UTC), YYYY-MM-DD
  active: number;
  signed_up: number;
  returned_week1: number | null; // null until every reader who signed up that week has had days 7 to 13
  discussion_readers: number;
  added_search: number;
  added_manual: number;
  added_ao3: number;
  added_bg: number;
  added_en: number;
  added_unknown: number;
};

/** The last `weeks` weeks, oldest first; the last row is the current week. */
export async function fetchNumbers(weeks: number): Promise<WeekNumbers[]> {
  const { data, error } = await supabase.rpc('admin_numbers', { p_weeks: weeks });
  if (error) throw error;
  return (data ?? []) as WeekNumbers[];
}
