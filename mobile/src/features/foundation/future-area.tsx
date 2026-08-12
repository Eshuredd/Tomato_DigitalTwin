import { AppHeader, AppScreen, EmptyState, SectionCard, StatusBadge } from '@/components/ui';

export function FutureArea({ eyebrow, title, description, availableWhen, testID }: { eyebrow: string; title: string; description: string; availableWhen: string; testID: string }) {
  return (
    <AppScreen testID={testID}>
      <AppHeader eyebrow={eyebrow} title={title} description={description} />
      <SectionCard><StatusBadge label="Foundation ready" tone="info" /><EmptyState title="No records to show" description={availableWhen} /></SectionCard>
    </AppScreen>
  );
}
