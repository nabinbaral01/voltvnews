import { getCoverage, type DateRange } from '@/lib/analytics-queries';
import { compactNumber } from '@/lib/utils';

/**
 * Says which readers a page of figures describes.
 *
 * Page views count everyone; everything that needs a visitor identity —
 * visitors, sessions, engagement, where they are, what they use, how they
 * arrived — comes from the readers who accepted analytics cookies. Without
 * this line, "1.3K page views, 40 visitors" reads as a bug. With the actual
 * share shown, it reads as what it is: a sample, and how big.
 */
export async function CoverageNote({ range }: { range: DateRange }) {
  const { all, sampled, share } = await getCoverage(range);
  if (!all) return null;

  const percent = share >= 0.1 ? Math.round(share * 100) : (share * 100).toFixed(1);

  return (
    <p className="-mt-3 mb-6 max-w-3xl text-xs text-muted">
      Page views count every reader. Every other figure describes the{' '}
      <span className="font-medium text-fg">{percent}%</span> who accepted analytics cookies —{' '}
      {compactNumber(sampled)} of {compactNumber(all)} page views in this range.
    </p>
  );
}
