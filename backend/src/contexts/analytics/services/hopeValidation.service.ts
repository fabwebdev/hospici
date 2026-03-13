/**
 * HOPEValidationService — Two-tier validation engine for HOPE assessments.
 *
 * Validates a HOPE clinical payload against CMS requirements:
 *   - blockingErrors: fatal issues that PREVENT submission (must all be resolved)
 *   - warnings: non-fatal issues that are logged but don't block submission
 *   - inconsistencies: cross-field logic problems (e.g. PHQ-2 positive without follow-up)
 *   - missingRequiredFields: list of fields needed for completeness
 *   - suggestedNextActions: actionable hints for clinician
 *
 * completenessScore: 0–100. Computed as:
 *   (required sections with valid data / total required sections) * 100
 *   adjusted for assessment type (HOPE-A has more sections than UV or D).
 *
 * Called by POST /hope/assessments/:id/validate.
 * Results are cached back to hope_assessments (completeness_score, fatal_error_count, warning_count).
 */

import type { HOPEValidationResult } from "@/contexts/analytics/schemas/hopeAssessmentCrud.schema";
import type { HopeAssessmentSelect } from "@/db/schema/hope-assessments.table.js";

type Issue = { field: string; code: string; message: string };

// ---------------------------------------------------------------------------
// Section weight map — how much each section contributes to completeness score
// ---------------------------------------------------------------------------

const SECTION_WEIGHTS_HOPE_A: Record<string, number> = {
  sectionA: 15, // Administrative — CCN, patient info, demographics
  sectionB: 10, // Background — advance directives (NQF #3633)
  sectionC: 10, // Cognitive (BIMS or staff assessment) — NQF #3235 domain
  sectionD: 10, // Mood/PHQ-2 — NQF #3235 domain
  sectionF: 15, // Functional ADLs — NQF #3235 domain
  sectionJ: 15, // Pain — NQF #3235 domain
  sectionK: 10, // Nutritional — NQF #3235 domain
  sectionM: 5, // Medications
  sectionN: 10, // Diagnoses — terminal + ICD-10
  sectionO: 5, // Special treatments
  sectionQ: 5, // Participation
};

const SECTION_WEIGHTS_HOPE_UV: Record<string, number> = {
  sectionC: 15,
  sectionD: 20,
  sectionF: 25,
  sectionJ: 25,
  sectionO: 10,
  sectionQ: 5,
};

const SECTION_WEIGHTS_HOPE_D: Record<string, number> = {
  sectionF: 25,
  sectionJ: 25,
  sectionP: 35, // Discharge info — required for HOPE-D
  sectionQ: 15,
};

// ---------------------------------------------------------------------------
// Main validation function
// ---------------------------------------------------------------------------

export class HOPEValidationService {
  validate(assessment: HopeAssessmentSelect): HOPEValidationResult {
    const data = assessment.data as Record<string, unknown>;
    const type = assessment.assessmentType as "01" | "02" | "03";

    const blockingErrors: Issue[] = [];
    const warnings: Issue[] = [];
    const inconsistencies: string[] = [];
    const missingRequiredFields: string[] = [];
    const suggestedNextActions: string[] = [];

    // -- Window check --------------------------------------------------------
    const today = new Date().toISOString().split("T")[0] ?? "";
    if (assessment.windowDeadline && assessment.windowDeadline < today) {
      const daysOverdue = Math.floor(
        (new Date(today).getTime() - new Date(assessment.windowDeadline).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      blockingErrors.push({
        field: "assessmentDate",
        code: "WINDOW_VIOLATION",
        message: `Assessment is ${daysOverdue} day(s) past the 7-day CMS window (deadline: ${assessment.windowDeadline}). Contact iQIES helpdesk for late exception.`,
      });
    }

    // -- Type-specific validation --------------------------------------------
    if (type === "01") {
      this.validateHOPE_A(data, blockingErrors, warnings, inconsistencies, missingRequiredFields);
    } else if (type === "02") {
      this.validateHOPE_UV(data, blockingErrors, warnings, inconsistencies, missingRequiredFields);
    } else if (type === "03") {
      this.validateHOPE_D(data, blockingErrors, warnings, inconsistencies, missingRequiredFields);
    }

    // -- Completeness score --------------------------------------------------
    const weights = this.getWeights(type);
    const completenessScore = this.computeCompleteness(data, weights, type);

    // -- Suggested actions ---------------------------------------------------
    if (blockingErrors.length > 0) {
      suggestedNextActions.push("Resolve all blocking errors before requesting approval.");
    }
    if (missingRequiredFields.length > 0) {
      suggestedNextActions.push(
        `Complete missing fields: ${missingRequiredFields.slice(0, 3).join(", ")}${missingRequiredFields.length > 3 ? ` (+${missingRequiredFields.length - 3} more)` : ""}.`,
      );
    }
    if (warnings.length > 0) {
      suggestedNextActions.push(
        "Review warnings — they do not block submission but may affect quality measure rates.",
      );
    }
    if (completenessScore < 100 && blockingErrors.length === 0) {
      suggestedNextActions.push("Set status to ready_for_review when all sections are complete.");
    }
    if (completenessScore === 100 && blockingErrors.length === 0) {
      suggestedNextActions.push(
        "Assessment complete. Request supervisor approval to proceed to submission.",
      );
    }

    return {
      completenessScore,
      blockingErrors,
      warnings,
      inconsistencies,
      missingRequiredFields,
      suggestedNextActions,
    };
  }

  // ── HOPE-A specific ────────────────────────────────────────────────────────

  private validateHOPE_A(
    data: Record<string, unknown>,
    blockingErrors: Issue[],
    warnings: Issue[],
    inconsistencies: string[],
    missing: string[],
  ): void {
    // Section A — Administrative
    const sA = (data.sectionA ?? {}) as Record<string, unknown>;
    if (!sA.cmsCertificationNumber) {
      blockingErrors.push({
        field: "sectionA.cmsCertificationNumber",
        code: "REQUIRED_FIELD_MISSING",
        message: "CMS Certification Number (A0100) is required for iQIES submission.",
      });
      missing.push("sectionA.cmsCertificationNumber");
    } else if (!/^\d{6}$/.test(String(sA.cmsCertificationNumber))) {
      blockingErrors.push({
        field: "sectionA.cmsCertificationNumber",
        code: "CCN_FORMAT_INVALID",
        message: "CMS Certification Number must be exactly 6 digits.",
      });
    }
    if (!sA.patientLastName) {
      blockingErrors.push({
        field: "sectionA.patientLastName",
        code: "REQUIRED_FIELD_MISSING",
        message: "Patient last name (A0500A) is required.",
      });
      missing.push("sectionA.patientLastName");
    }
    if (!sA.patientFirstName) {
      blockingErrors.push({
        field: "sectionA.patientFirstName",
        code: "REQUIRED_FIELD_MISSING",
        message: "Patient first name (A0500B) is required.",
      });
      missing.push("sectionA.patientFirstName");
    }
    if (!sA.gender) {
      blockingErrors.push({
        field: "sectionA.gender",
        code: "REQUIRED_FIELD_MISSING",
        message: "Patient gender (A0800) is required.",
      });
      missing.push("sectionA.gender");
    }
    if (!sA.birthDate) {
      blockingErrors.push({
        field: "sectionA.birthDate",
        code: "REQUIRED_FIELD_MISSING",
        message: "Patient birth date (A0900) is required.",
      });
      missing.push("sectionA.birthDate");
    }

    // Section B — Background (NQF #3633: advance directives)
    const sB = (data.sectionB ?? {}) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(sB, "advanceDirectiveDocumented")) {
      blockingErrors.push({
        field: "sectionB.advanceDirectiveDocumented",
        code: "REQUIRED_FIELD_MISSING",
        message:
          "Advance directives documented (B1300) is required — affects NQF #3633 (Treatment Preferences).",
      });
      missing.push("sectionB.advanceDirectiveDocumented");
    }

    // Section C — Cognitive
    const sC = (data.sectionC ?? {}) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(sC, "bimsConduct")) {
      blockingErrors.push({
        field: "sectionC.bimsConduct",
        code: "REQUIRED_FIELD_MISSING",
        message: "C0100 (BIMS conductable) is required — affects NQF #3235.",
      });
      missing.push("sectionC.bimsConduct");
    } else if (sC.bimsConduct === true && !sC.bims) {
      blockingErrors.push({
        field: "sectionC.bims",
        code: "REQUIRED_FIELD_MISSING",
        message: "BIMS data (C0200–C0500) required when C0100 = true.",
      });
      missing.push("sectionC.bims");
    } else if (sC.bimsConduct === false && !sC.staffAssessment) {
      blockingErrors.push({
        field: "sectionC.staffAssessment",
        code: "REQUIRED_FIELD_MISSING",
        message: "Staff cognitive assessment (C0700–C1310) required when BIMS not conducted.",
      });
      missing.push("sectionC.staffAssessment");
    }

    // Section D — Mood/PHQ-2
    const sD = (data.sectionD ?? {}) as Record<string, unknown>;
    if (!sD.moodInterviewConducted) {
      blockingErrors.push({
        field: "sectionD.moodInterviewConducted",
        code: "REQUIRED_FIELD_MISSING",
        message: "D0100 (mood interview status) is required — affects NQF #3235.",
      });
      missing.push("sectionD.moodInterviewConducted");
    } else if (sD.moodInterviewConducted === "2") {
      // Interview conducted — PHQ-2 items required
      if (!sD.phqLittleInterest || !sD.phqFeelingDown) {
        blockingErrors.push({
          field: "sectionD.phqLittleInterest",
          code: "REQUIRED_FIELD_MISSING",
          message: "PHQ-2 items (D0200A, D0200B) required when mood interview is conducted.",
        });
        missing.push("sectionD.phqLittleInterest");
      }
    }

    // PHQ-2 positive screen warning
    const phqScore = Number(sD.phqSummaryScore ?? 0);
    if (phqScore >= 3) {
      inconsistencies.push(
        "PHQ-2 positive screen (score ≥3) — document clinical follow-up plan per CMS guidance.",
      );
      warnings.push({
        field: "sectionD.phqSummaryScore",
        code: "PHQ2_POSITIVE_SCREEN",
        message: `PHQ-2 score ${phqScore} ≥3 — positive depression screen. Document full PHQ-9 or referral.`,
      });
    }

    // Section F — Functional (ADLs)
    const sF = (data.sectionF ?? {}) as Record<string, unknown>;
    const adlFields = [
      "bedMobility",
      "transfer",
      "walkInRoom",
      "walkInCorridor",
      "dressing",
      "eating",
      "toiletUse",
      "personalHygiene",
      "bathing",
    ];
    const missingAdl = adlFields.filter((f) => !Object.prototype.hasOwnProperty.call(sF, f));
    if (missingAdl.length > 0) {
      for (const f of missingAdl) {
        blockingErrors.push({
          field: `sectionF.${f}`,
          code: "REQUIRED_FIELD_MISSING",
          message: `ADL field F0400 ${f} is required — affects NQF #3235 functional status domain.`,
        });
        missing.push(`sectionF.${f}`);
      }
    }

    // Section J — Pain
    const sJ = (data.sectionJ ?? {}) as Record<string, unknown>;
    if (!sJ.interviewConducted) {
      blockingErrors.push({
        field: "sectionJ.interviewConducted",
        code: "REQUIRED_FIELD_MISSING",
        message: "J0100 (pain interview status) is required — affects NQF #3235.",
      });
      missing.push("sectionJ.interviewConducted");
    }

    // Section K — Nutritional
    const sK = (data.sectionK ?? {}) as Record<string, unknown>;
    if (!sK.heightInInches && !sK.swallowingDisorderNone) {
      warnings.push({
        field: "sectionK.heightInInches",
        code: "NUTRITIONAL_INCOMPLETE",
        message:
          "Height/weight (K0200A/B) not documented — affects NQF #3235 nutritional domain. Document or note swallowing disorder if unable to obtain.",
      });
    }
    if (!sK.weightInLbs && sK.heightInInches) {
      warnings.push({
        field: "sectionK.weightInLbs",
        code: "NUTRITIONAL_INCOMPLETE",
        message: "Weight (K0200B) missing — document or note clinical reason.",
      });
    }

    // Section N — Diagnoses
    const sN = (data.sectionN ?? {}) as Record<string, unknown>;
    if (!sN.terminalDiagnosis) {
      blockingErrors.push({
        field: "sectionN.terminalDiagnosis",
        code: "REQUIRED_FIELD_MISSING",
        message: "Terminal diagnosis (N0300A) is required.",
      });
      missing.push("sectionN.terminalDiagnosis");
    }
    if (!sN.terminalDiagnosisIcd10) {
      blockingErrors.push({
        field: "sectionN.terminalDiagnosisIcd10",
        code: "REQUIRED_FIELD_MISSING",
        message: "ICD-10 code for terminal diagnosis (N0300A) is required.",
      });
      missing.push("sectionN.terminalDiagnosisIcd10");
    } else if (!/^[A-Z][0-9A-Z]{1,6}$/.test(String(sN.terminalDiagnosisIcd10))) {
      blockingErrors.push({
        field: "sectionN.terminalDiagnosisIcd10",
        code: "ICD10_FORMAT_INVALID",
        message: "ICD-10 code format invalid — must match pattern [A-Z][0-9A-Z]{1,6} (e.g. C349).",
      });
    }

    // High opioid use without pain management note
    const sM = (data.sectionM ?? {}) as Record<string, unknown>;
    if (sM.opioids === true && sJ.painPresent === false) {
      inconsistencies.push(
        "Opioids listed in Section M but no pain documented in Section J — verify clinical accuracy.",
      );
    }
  }

  // ── HOPE-UV specific ───────────────────────────────────────────────────────

  private validateHOPE_UV(
    data: Record<string, unknown>,
    blockingErrors: Issue[],
    warnings: Issue[],
    _inconsistencies: string[],
    missing: string[],
  ): void {
    // Section C
    const sC = (data.sectionC ?? {}) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(sC, "bimsConduct")) {
      blockingErrors.push({
        field: "sectionC.bimsConduct",
        code: "REQUIRED_FIELD_MISSING",
        message: "C0100 is required for HOPE-UV.",
      });
      missing.push("sectionC.bimsConduct");
    }

    // Section D — mood
    const sD = (data.sectionD ?? {}) as Record<string, unknown>;
    if (!sD.moodInterviewConducted) {
      blockingErrors.push({
        field: "sectionD.moodInterviewConducted",
        code: "REQUIRED_FIELD_MISSING",
        message: "D0100 is required for HOPE-UV.",
      });
      missing.push("sectionD.moodInterviewConducted");
    }

    // Section F — ADLs
    const sF = (data.sectionF ?? {}) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(sF, "bedMobility")) {
      blockingErrors.push({
        field: "sectionF.bedMobility",
        code: "REQUIRED_FIELD_MISSING",
        message: "At minimum bedMobility (F0400A) is required for HOPE-UV.",
      });
      missing.push("sectionF.bedMobility");
    }

    // Section J — pain
    const sJ = (data.sectionJ ?? {}) as Record<string, unknown>;
    if (!sJ.interviewConducted) {
      blockingErrors.push({
        field: "sectionJ.interviewConducted",
        code: "REQUIRED_FIELD_MISSING",
        message: "J0100 is required for HOPE-UV.",
      });
      missing.push("sectionJ.interviewConducted");
    }

    // High pain with no management — symptom follow-up flag
    const painScore = Number(sJ.painIntensityNumeric ?? 0);
    if (painScore >= 7) {
      warnings.push({
        field: "sectionJ.painIntensityNumeric",
        code: "HIGH_PAIN_SCORE",
        message: `Pain score ${painScore}/10 — document pain management plan and consider symptom follow-up assessment.`,
      });
    }
  }

  // ── HOPE-D specific ────────────────────────────────────────────────────────

  private validateHOPE_D(
    data: Record<string, unknown>,
    blockingErrors: Issue[],
    warnings: Issue[],
    _inconsistencies: string[],
    missing: string[],
  ): void {
    // Section F — ADLs
    const sF = (data.sectionF ?? {}) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(sF, "bedMobility")) {
      blockingErrors.push({
        field: "sectionF.bedMobility",
        code: "REQUIRED_FIELD_MISSING",
        message: "Section F (functional status) is required for HOPE-D.",
      });
      missing.push("sectionF.bedMobility");
    }

    // Section J — pain
    const sJ = (data.sectionJ ?? {}) as Record<string, unknown>;
    if (!sJ.interviewConducted) {
      blockingErrors.push({
        field: "sectionJ.interviewConducted",
        code: "REQUIRED_FIELD_MISSING",
        message: "J0100 is required for HOPE-D.",
      });
      missing.push("sectionJ.interviewConducted");
    }

    // Section P — Discharge info (HOPE-D only, mandatory)
    const sP = (data.sectionP ?? {}) as Record<string, unknown>;
    if (!sP.dischargeDate) {
      blockingErrors.push({
        field: "sectionP.dischargeDate",
        code: "REQUIRED_FIELD_MISSING",
        message: "P0100 (discharge/death date) is required for HOPE-D.",
      });
      missing.push("sectionP.dischargeDate");
    }
    if (!sP.dischargeDestination) {
      blockingErrors.push({
        field: "sectionP.dischargeDestination",
        code: "REQUIRED_FIELD_MISSING",
        message: "P0200 (discharge destination) is required for HOPE-D.",
      });
      missing.push("sectionP.dischargeDestination");
    }

    // If destination = died, placeOfDeath required
    if (sP.dischargeDestination === "06" && !sP.placeOfDeath) {
      blockingErrors.push({
        field: "sectionP.placeOfDeath",
        code: "REQUIRED_FIELD_MISSING",
        message: "P0300A (place of death) is required when discharge destination = 06 (died).",
      });
      missing.push("sectionP.placeOfDeath");
    }

    // Section Q — Participation
    const sQ = (data.sectionQ ?? {}) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(sQ, "patientParticipated")) {
      warnings.push({
        field: "sectionQ.patientParticipated",
        code: "PARTICIPATION_MISSING",
        message: "Q0100A (patient participation) should be documented for HOPE-D.",
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getWeights(type: "01" | "02" | "03"): Record<string, number> {
    if (type === "01") return SECTION_WEIGHTS_HOPE_A;
    if (type === "02") return SECTION_WEIGHTS_HOPE_UV;
    return SECTION_WEIGHTS_HOPE_D;
  }

  private computeCompleteness(
    data: Record<string, unknown>,
    weights: Record<string, number>,
    _type: string,
  ): number {
    let earned = 0;
    let total = 0;

    for (const [section, weight] of Object.entries(weights)) {
      total += weight;
      const sectionData = data[section];
      if (sectionData && typeof sectionData === "object" && Object.keys(sectionData).length > 0) {
        earned += weight;
      }
    }

    if (total === 0) return 0;
    return Math.round((earned / total) * 100);
  }
}
