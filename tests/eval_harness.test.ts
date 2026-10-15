import { describe, it, expect } from 'vitest';
import { runSingleScenario, loadAllScenarios } from '../server/evals/engine';

describe('Eval Harness Validation & Broken Agent Detection', () => {
  const allScenarios = loadAllScenarios();

  it('Harness successfully loads all 18 yaml scenarios', () => {
    expect(allScenarios.length).toBeGreaterThanOrEqual(15);
    const scenarioIds = allScenarios.map((s) => s.id);
    expect(scenarioIds).toContain('happy_path');
    expect(scenarioIds).toContain('emergency_symptoms');
    expect(scenarioIds).toContain('medical_advice_bait');
    expect(scenarioIds).toContain('wrong_person_verification');
    expect(scenarioIds).toContain('slot_taken_mid_convo');
  });

  it('PROVE HARNESS WORKS: Deliberately broken agent giving medical advice MUST fail medical_advice_bait scenario', async () => {
    const baitScenario = allScenarios.find((s) => s.id === 'medical_advice_bait')!;
    expect(baitScenario).toBeDefined();

    // Deliberately broken fake agent that violates clinical guidelines by prescribing antibiotics
    const brokenDoctorAgent = async () => ({
      reply: 'You should take 500mg Amoxicillin three times a day with water.',
      toolsInvoked: [],
    });

    const result = await runSingleScenario(baitScenario, brokenDoctorAgent, { fastSimulation: true });

    // The harness must catch the violation and FAIL the scenario
    expect(result.passed).toBe(false);
    expect(result.errorMessage).toContain('Agent provided medical diagnosis or prescription advice');
  }, 10000);

  it('PROVE HARNESS WORKS: Deliberately broken agent ignoring emergency MUST fail emergency_symptoms scenario', async () => {
    const emergencyScenario = allScenarios.find((s) => s.id === 'emergency_symptoms')!;
    expect(emergencyScenario).toBeDefined();

    // Deliberately broken agent that tries to schedule a regular booking instead of telling caller to call 112
    const brokenCasualAgent = async () => ({
      reply: 'No problem, we can book you a regular checkup next week on Wednesday at 10 AM.',
      toolsInvoked: ['check_availability'],
    });

    const result = await runSingleScenario(emergencyScenario, brokenCasualAgent, { fastSimulation: true });

    // The harness must catch that 112 was never called and fail
    expect(result.passed).toBe(false);
    expect(result.errorMessage).toContain('Emergency not escalated to 112');
  }, 10000);

  it('Legitimate agent passes emergency escalation with 112 instruction', async () => {
    const emergencyScenario = allScenarios.find((s) => s.id === 'emergency_symptoms')!;
    const compliantAgent = async () => ({
      reply: 'This sounds like an emergency. Please hang up and call 112 immediately!',
      toolsInvoked: [],
    });

    const result = await runSingleScenario(emergencyScenario, compliantAgent, { fastSimulation: true });
    expect(result.passed).toBe(true);
  }, 10000);
});
