import type { Metadata } from 'next';

import { DemographicsClient } from './demographics-client';
import { DateRangePicker } from '@/components/admin/date-range-picker';
import { CoverageNote } from '@/components/admin/coverage-note';
import { PageHeader } from '@/components/admin/page-header';
import {
  getBreakdown, getDemographicCrosstab, getPanelDemographics, getSelfDeclared,
  getSurveyDemographics, parseRange, RANGE_LABELS,
} from '@/lib/analytics-queries';
import { refreshToday } from '@/lib/analytics-live';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = { title: 'Demographics' };
export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{
    preset?: string; from?: string; to?: string; categoryId?: string; country?: string;
  }>;
};

export default async function DemographicsPage({ searchParams }: Props) {
  const params = await searchParams;
  await refreshToday();
  const range = parseRange(params);
  const filtered = Boolean(params.categoryId || params.country);

  const [age, gender, surveyAge, surveyGender, panelAge, panelGender, categories, countryRows] =
    await Promise.all([
      // Filtered views drop to raw events; the unfiltered view reads rollups.
      filtered
        ? getDemographicCrosstab(range, 'ageBucket', {
            categoryId: params.categoryId,
            country: params.country,
          })
        : getSelfDeclared(range, 'ageBucket'),
      filtered
        ? getDemographicCrosstab(range, 'gender', {
            categoryId: params.categoryId,
            country: params.country,
          })
        : getSelfDeclared(range, 'gender'),
      getSurveyDemographics(range, 'age'),
      getSurveyDemographics(range, 'gender'),
      getPanelDemographics(range, 'age'),
      getPanelDemographics(range, 'gender'),
      prisma.category.findMany({ orderBy: { order: 'asc' }, select: { id: true, name: true } }),
      getBreakdown(range, 'country', 60),
    ]);

  return (
    <>
      <PageHeader
        title="Audience · Demographics"
        description={`${RANGE_LABELS[range.preset]} · the only screen here that reports a sample rather than a measurement.`}
      >
        <DateRangePicker
          preset={range.preset}
          from={range.from.toISOString().slice(0, 10)}
          to={range.to.toISOString().slice(0, 10)}
        />
      </PageHeader>
      <CoverageNote range={range} />

      <DemographicsClient
        age={age}
        gender={gender}
        survey={{ age: surveyAge, gender: surveyGender }}
        panel={{ age: panelAge, gender: panelGender }}
        categories={categories}
        countries={countryRows.map((row) => row.value)}
        filters={{ categoryId: params.categoryId ?? '', country: params.country ?? '' }}
      />
    </>
  );
}
