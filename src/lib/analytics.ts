import type { Opportunity, Pipeline, Stage } from "@/lib/crm/types";

export interface StageBucket {
  stage: Stage;
  count: number;
  value: number;
}

export interface PipelineMetrics {
  currency: string;
  openValue: number;
  weightedForecast: number;
  openCount: number;
  wonValue: number;
  wonCount: number;
  lostCount: number;
  winRate: number;
  avgDealSize: number;
  buckets: StageBucket[];
}

export function computeMetrics(opportunities: Opportunity[], pipeline: Pipeline): PipelineMetrics {
  const stages = pipeline.stages;
  const byId = new Map(stages.map((s) => [s.id, s]));
  const currency = opportunities[0]?.currency ?? "USD";

  let openValue = 0;
  let weighted = 0;
  let openCount = 0;
  let wonValue = 0;
  let wonCount = 0;
  let lostCount = 0;

  const buckets: StageBucket[] = stages.map((s) => ({ stage: s, count: 0, value: 0 }));
  const bucketIndex = new Map(stages.map((s, i) => [s.id, i]));

  for (const o of opportunities) {
    const stage = byId.get(o.stageId);
    if (!stage) continue;
    const bi = bucketIndex.get(o.stageId);
    if (bi !== undefined) {
      buckets[bi].count += 1;
      buckets[bi].value += o.value;
    }
    if (stage.type === "won") {
      wonValue += o.value;
      wonCount += 1;
    } else if (stage.type === "lost") {
      lostCount += 1;
    } else {
      openValue += o.value;
      weighted += o.value * stage.probability;
      openCount += 1;
    }
  }

  const closed = wonCount + lostCount;
  const winRate = closed > 0 ? wonCount / closed : 0;
  const avgDealSize = wonCount > 0 ? wonValue / wonCount : 0;

  return {
    currency,
    openValue,
    weightedForecast: Math.round(weighted),
    openCount,
    wonValue,
    wonCount,
    lostCount,
    winRate,
    avgDealSize,
    buckets,
  };
}
