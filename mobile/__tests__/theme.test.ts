import { semanticColorLabels } from '@/lib/theme';

it('names the trust and uncertainty semantics explicitly', () => {
  expect(semanticColorLabels).toEqual(expect.objectContaining({ agronomy: 'Deterministic agronomy', aiEvidence: 'AI supporting evidence', uncertaintyLow: 'Low uncertainty', uncertaintyMedium: 'Medium uncertainty', uncertaintyHigh: 'High uncertainty' }));
});
