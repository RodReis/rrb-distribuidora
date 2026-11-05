import fixture from "./fixtures/rupture-v1.json";
import { calculateCoverageDays, calculatePredictiveDecision } from "./predictive-engine";

type FixtureCase = (typeof fixture.cases)[number];

export function evaluateRuptureFixture() {
  const evaluated = fixture.cases.map((testCase: FixtureCase) => {
    const available = testCase.physical - testCase.reserved;
    const coverageDays = calculateCoverageDays(available, testCase.avgDaily);
    const decision = calculatePredictiveDecision({
      resolvedLeadTime: {
        days: testCase.leadTimeDays,
        source: testCase.leadTimeDays === null ? "unavailable" : "supplier_record",
      },
      currentStock: available,
      avgDailyConsumption: testCase.avgDaily,
      stdDevDaily: testCase.stdDev,
      coverageDays,
    });
    return {
      id: testCase.id,
      eligible: testCase.eligible,
      reason: testCase.reason,
      expectedStatus: testCase.expectedStatus,
      actualStatus: decision.predictiveStatus,
      correct: testCase.eligible ? decision.predictiveStatus === testCase.expectedStatus : null,
      available,
      coverageDays,
      tieGroup: "tieGroup" in testCase ? testCase.tieGroup : null,
    };
  });
  const eligibleCases = evaluated.filter((item) => item.eligible);
  const tieGroups = new Map<string, number[]>();
  for (const item of evaluated) {
    if (item.tieGroup) tieGroups.set(item.tieGroup, [...(tieGroups.get(item.tieGroup) ?? []), item.coverageDays]);
  }
  const tieGroupsValid = [...tieGroups.values()].every((coverages) => new Set(coverages).size === 1);
  const alertStatuses = new Set(["CRITICAL_RUPTURE", "WARNING"]);
  const correct = eligibleCases.filter((item) => item.correct).length;
  const falsePositives = eligibleCases.filter(
    (item) => !alertStatuses.has(item.expectedStatus ?? "") && alertStatuses.has(item.actualStatus)
  ).length;
  const falseNegatives = eligibleCases.filter(
    (item) => alertStatuses.has(item.expectedStatus ?? "") && !alertStatuses.has(item.actualStatus)
  ).length;
  return {
    fixtureId: fixture.fixtureId,
    methodVersion: fixture.methodVersion,
    eligibleCount: eligibleCases.length,
    correctCount: correct,
    accuracy: eligibleCases.length ? correct / eligibleCases.length : null,
    falsePositives,
    falseNegatives,
    tieGroupsValid,
    cases: evaluated,
  };
}
