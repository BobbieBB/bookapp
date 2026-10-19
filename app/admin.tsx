import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ErrorText, T } from '@/components/ui';
import { useLanguage, useT } from '@/i18n';
import type { MessageKey } from '@/i18n/en';
import { fetchNumbers, type WeekNumbers } from '@/lib/admin';
import { useLookup } from '@/lib/useLookup';
import { space, useTheme } from '@/theme';

// Profile > Numbers: the PO's weekly numbers (docs/DECISIONS.md, "Analytics"), so nobody needs SQL.
// Only admins get the link; the database refuses everyone else, and this screen says so.
const WEEKS = 8;

type Translate = ReturnType<typeof useT>;

type Metric = {
  id: string;
  title: MessageKey;
  hint: MessageKey;
  value: (week: WeekNumbers, t: Translate) => string;
};

const METRICS: Metric[] = [
  { id: 'active', title: 'admin.active', hint: 'admin.activeHint', value: (w) => String(w.active) },
  {
    id: 'returned',
    title: 'admin.returned',
    hint: 'admin.returnedHint',
    value: (w, t) =>
      w.returned_week1 === null ? t('admin.notYet') : t('admin.returnedValue', { returned: w.returned_week1, signedUp: w.signed_up }),
  },
  { id: 'discussion', title: 'admin.discussion', hint: 'admin.discussionHint', value: (w) => String(w.discussion_readers) },
  {
    id: 'sources',
    title: 'admin.sources',
    hint: 'admin.sourcesHint',
    value: (w) => `${w.added_search} · ${w.added_manual} · ${w.added_ao3}`,
  },
  {
    id: 'languages',
    title: 'admin.languages',
    hint: 'admin.languagesHint',
    value: (w) => `${w.added_bg} · ${w.added_en} · ${w.added_unknown}`,
  },
];

// Postgres' "permission denied" (42501): admin_numbers refuses readers who are not admins.
const refused = (error: unknown) => (error as { code?: string } | null)?.code === '42501';

function MetricCard({ metric, weeks, weekLabel }: { metric: Metric; weeks: WeekNumbers[]; weekLabel: (w: WeekNumbers) => string }) {
  const { c } = useTheme();
  const t = useT();
  const current = weeks[weeks.length - 1];
  // Week-1 return is unknown for the latest weeks, so the headline is the latest week that is known.
  const headline = metric.id === 'returned' ? [...weeks].reverse().find((w) => w.returned_week1 !== null) : current;

  return (
    <Card>
      <View testID={`numbers-${metric.id}`} style={{ gap: space.s }}>
        <T v="h2">{t(metric.title)}</T>
        <T v="muted">{t(metric.hint)}</T>
        <T v="overline">{headline === current ? t('admin.thisWeek') : t('admin.latestKnown')}</T>
        <T v="moment">{headline ? metric.value(headline, t) : t('admin.notYet')}</T>
        <T v="overline">{t('admin.lastWeeks', { count: weeks.length })}</T>
        {[...weeks].reverse().map((w) => (
          <View
            key={w.week}
            testID={`week-${w.week}`}
            style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.s, borderTopWidth: 1, borderColor: c.hairline, paddingTop: space.xs }}
          >
            <T v="muted">{weekLabel(w)}</T>
            <View testID={`value-${w.week}`}>
              <T v="label">{metric.value(w, t)}</T>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

export default function Admin() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { language } = useLanguage();
  const { data, error } = useLookup(`admin-numbers-${WEEKS}`, () => fetchNumbers(WEEKS));
  const dates = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const weekLabel = (w: WeekNumbers) => dates.format(new Date(`${w.week}T00:00:00Z`));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ground }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l }}>
        <View style={{ alignItems: 'flex-start' }}>
          <Button variant="link" title={t('admin.back')} onPress={() => router.back()} />
        </View>
        <T v="h1">{t('admin.title')}</T>
        {error !== undefined ? (
          <ErrorText>{refused(error) ? t('admin.refused') : t('admin.error')}</ErrorText>
        ) : !data ? (
          <ActivityIndicator color={c.primary} />
        ) : (
          <>
            <T v="muted">{t('admin.intro')}</T>
            {METRICS.map((metric) => (
              <MetricCard key={metric.id} metric={metric} weeks={data} weekLabel={weekLabel} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
