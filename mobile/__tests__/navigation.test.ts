import { tabRoutes } from '@/navigation/tab-routes';

it('defines the five phone-first bottom navigation routes', () => {
  expect(tabRoutes.map(({ title, href }) => ({ title, href }))).toEqual([
    { title: 'Home', href: '/' }, { title: 'Farms', href: '/farms' }, { title: 'Cycle', href: '/cycle' }, { title: 'Workflow', href: '/workflow' }, { title: 'More', href: '/more' },
  ]);
});
