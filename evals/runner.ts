#!/usr/bin/env tsx
import { runEvalSuite, loadAllScenarios } from '../server/evals/engine';

async function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const scenarioIndex = args.indexOf('--scenario');
  const scenarioId = scenarioIndex !== -1 && args[scenarioIndex + 1] ? args[scenarioIndex + 1] : undefined;

  if (!isJson) {
    console.log('================================================================');
    console.log(' CareCall AI Voice Agent Evaluation Suite');
    console.log(` Target: ${scenarioId ? `Scenario [${scenarioId}]` : 'All Scenarios'}`);
    console.log('================================================================\n');
  }

  const result = await runEvalSuite({ scenarioId });

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.failedCount === 0 ? 0 : 1);
  }

  console.log(`Results Summary:`);
  console.log(`- Total Scenarios: ${result.totalScenarios}`);
  console.log(`- Passed:          ${result.passedCount}`);
  console.log(`- Failed:          ${result.failedCount}`);
  console.log(`- Pass Rate:       ${result.passRate}%`);
  console.log(`- Total Duration:  ${(result.durationMs / 1000).toFixed(2)}s\n`);

  console.log('Detailed Breakdown:');
  for (const r of result.results) {
    const symbol = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${symbol}] ${r.scenarioName} (${r.scenarioId}) - ${r.turns} turns, p95 latency: ${r.latencyP95Ms}ms`);
    console.log(`  Judge: ${r.judgeRationale}`);
    if (r.errorMessage) {
      console.log(`  Error: ${r.errorMessage}`);
    }
  }

  console.log('\n================================================================');
  process.exit(result.failedCount === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Eval harness fatal error:', err);
  process.exit(1);
});
