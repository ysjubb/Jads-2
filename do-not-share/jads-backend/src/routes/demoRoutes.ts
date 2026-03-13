/**
 * FP18 — Demo API Routes
 *
 * End-to-end demo workflow: FPL → PA → Sign → Chain → Verify → BSA Certificate
 */

import { Router, Request, Response } from 'express';
import {
  createDemoFlight,
  simulateDemoFlight,
  getDemoFullReport,
  getAftnComparison,
  getAic302Scenario,
  getDroneEnforcementScenario,
} from '../services/demo/DemoOrchestrator';

const router = Router();

/**
 * POST /api/demo/create-flight
 *
 * Create a demo flight: validates inputs, builds AFTN FPL, generates signed PA.
 */
router.post('/create-flight', async (req: Request, res: Response) => {
  try {
    const input = req.body;
    if (!input.callsign) {
      return res.status(400).json({ error: 'callsign is required' });
    }
    const result = await createDemoFlight(input);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/demo/simulate-flight/:missionId
 *
 * Simulate a drone flight with optional geofence violations.
 */
router.post('/simulate-flight/:missionId', async (req: Request, res: Response) => {
  try {
    const { missionId } = req.params;
    const { includeViolations = true, violationCount = 2 } = req.body;
    const result = await simulateDemoFlight(missionId, includeViolations, violationCount);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/demo/full-report/:missionId
 *
 * Full demo report aggregating all pipeline outputs.
 */
router.get('/full-report/:missionId', async (req: Request, res: Response) => {
  try {
    const { missionId } = req.params;
    const report = getDemoFullReport(missionId);
    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/demo/aftn-comparison
 *
 * JADS vs OFPL capabilities comparison.
 */
router.get('/aftn-comparison', async (_req: Request, res: Response) => {
  try {
    const comparison = getAftnComparison();
    return res.json(comparison);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/demo/scenarios
 *
 * Returns pre-configured demo scenarios.
 */
router.get('/scenarios', async (_req: Request, res: Response) => {
  try {
    return res.json({
      aic302_delhi_mumbai: getAic302Scenario(),
      drone_enforcement: getDroneEnforcementScenario(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/demo/run-full
 *
 * One-click full demo: creates AIC302 + drone, simulates, verifies, generates cert.
 */
router.post('/run-full', async (_req: Request, res: Response) => {
  try {
    // Step 1: Create AIC302 flight
    const aic302 = await createDemoFlight(getAic302Scenario());

    // Step 2: Create drone enforcement flight
    const drone = await createDemoFlight(getDroneEnforcementScenario());

    // Step 3: Simulate drone flight with violations
    const simulation = await simulateDemoFlight(drone.missionId, true, 2);

    // Step 4: Get full report
    const report = getDemoFullReport(drone.missionId);

    return res.json({
      step1_aic302: {
        missionId: aic302.missionId,
        aftnMessagePreview: aic302.aftnMessage.substring(0, 200) + '...',
        crossValidation: aic302.crossValidation,
      },
      step2_drone: {
        missionId: drone.missionId,
        flightId: drone.flightId,
        paGenerated: !!drone.signedPaXml,
      },
      step3_simulation: {
        totalEntries: simulation.totalEntries,
        breaches: simulation.breaches,
        chainHash: simulation.chainHash,
      },
      step4_verification: {
        chainValid: report.chainVerification.valid,
        entriesVerified: report.chainVerification.entriesVerified,
      },
      step5_bsa_certificate: {
        certificateId: report.bsa2023Certificate.certificateId,
        chainHash: report.bsa2023Certificate.partA.evidenceRecord.chainHash,
        geofenceBreaches: report.bsa2023Certificate.partA.evidenceRecord.geofenceBreaches,
        partBStatus: report.bsa2023Certificate.partB.signature,
      },
      step6_comparison: report.jadsVsOfpl,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
