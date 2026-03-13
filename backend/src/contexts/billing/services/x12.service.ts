/**
 * X12Service — T3-7a
 *
 * Generates ANSI X12 837I (institutional) transaction sets for hospice claims.
 * Supports original (frequency 1), replacement (frequency 7), and void (frequency 8).
 *
 * Output: { x12: string; payloadHash: string; x12Hash: string }
 * Both hashes are SHA-256 hex strings.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface X12ClaimLine {
  revenueCode: string;
  hcpcsCode?: string | null;
  serviceDate: string; // YYYY-MM-DD
  units: number;
  lineCharge: number;
}

export interface X12GeneratorInput {
  claimId: string;
  priorClaimIcn?: string;
  billType: "original" | "replacement" | "void";
  statementFromDate: string; // YYYY-MM-DD
  statementToDate: string; // YYYY-MM-DD
  totalCharge: string; // numeric string e.g. "1234.56"
  payerId: string;
  billingProviderNpi?: string;
  billingProviderName?: string;
  billingProviderTaxId?: string;
  patientLastName?: string;
  patientFirstName?: string;
  patientDob?: string; // YYYY-MM-DD
  patientMemberId?: string;
  lines: X12ClaimLine[];
}

export interface X12GeneratorOutput {
  x12: string;
  payloadHash: string;
  x12Hash: string;
}

// ---------------------------------------------------------------------------
// Constants / defaults
// ---------------------------------------------------------------------------

const DEFAULT_NPI = "0000000000";
const DEFAULT_BILLING_NAME = "HOSPICI AGENCY";
const DEFAULT_TAX_ID = "000000000";
const DEFAULT_PATIENT_LAST = "UNKNOWN";
const DEFAULT_PATIENT_FIRST = "UNKNOWN";
const DEFAULT_PATIENT_DOB_FORMATTED = "19000101";
const DEFAULT_MEMBER_ID = "UNKNOWN";

const HOSPICE_TAXONOMY = "251G00000X";
const SEGMENT_TERMINATOR = "~\n";
const ELEMENT_SEPARATOR = "*";
const COMPOSITE_SEPARATOR = ":";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** YYYY-MM-DD → YYYYMMDD */
function toD8(date: string): string {
  return date.replace(/-/g, "");
}

/** YYYY-MM-DD → YYMMDD */
function toIsaDate(date: string): string {
  const d8 = toD8(date);
  return d8.slice(2); // drop century digits
}

/** Returns current date as YYYYMMDD */
function nowDateGS(): string {
  const now = new Date();
  const y = now.getUTCFullYear().toString().padStart(4, "0");
  const m = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = now.getUTCDate().toString().padStart(2, "0");
  return `${y}${m}${d}`;
}

/** Returns current date as YYMMDD for ISA */
function nowDateISA(): string {
  return nowDateGS().slice(2);
}

/** Returns current time as HHMM */
function nowTime(): string {
  const now = new Date();
  const h = now.getUTCHours().toString().padStart(2, "0");
  const min = now.getUTCMinutes().toString().padStart(2, "0");
  return `${h}${min}`;
}

// ---------------------------------------------------------------------------
// Segment builder
// ---------------------------------------------------------------------------

/** Joins elements with * and appends ~\n */
function seg(...elements: string[]): string {
  return elements.join(ELEMENT_SEPARATOR) + SEGMENT_TERMINATOR;
}

/** Joins composite sub-elements with : */
function composite(...parts: string[]): string {
  return parts.join(COMPOSITE_SEPARATOR);
}

// ---------------------------------------------------------------------------
// Frequency code map
// ---------------------------------------------------------------------------

function freqCode(billType: X12GeneratorInput["billType"]): string {
  switch (billType) {
    case "original":
      return "1";
    case "replacement":
      return "7";
    case "void":
      return "8";
  }
}

// ---------------------------------------------------------------------------
// X12 builder
// ---------------------------------------------------------------------------

function buildX12(input: X12GeneratorInput): string {
  const bNpi = input.billingProviderNpi ?? DEFAULT_NPI;
  const bName = input.billingProviderName ?? DEFAULT_BILLING_NAME;
  const bTaxId = input.billingProviderTaxId ?? DEFAULT_TAX_ID;
  const ptLast = input.patientLastName ?? DEFAULT_PATIENT_LAST;
  const ptFirst = input.patientFirstName ?? DEFAULT_PATIENT_FIRST;
  const ptDob = input.patientDob ? toD8(input.patientDob) : DEFAULT_PATIENT_DOB_FORMATTED;
  const memberId = input.patientMemberId ?? DEFAULT_MEMBER_ID;

  const dateISA = nowDateISA();
  const dateGS = nowDateGS();
  const time = nowTime();
  const freq = freqCode(input.billType);

  const fromD8 = toD8(input.statementFromDate);
  const toD8val = toD8(input.statementToDate);

  // We'll collect all segments as strings, then count them for SE.
  // ISA, GS, ST are envelope — SE, GE, IEA close them.
  // Segment count in SE includes ST through SE (inclusive).

  const segments: string[] = [];

  // ------------------------------------------------------------------
  // Interchange Envelope
  // ------------------------------------------------------------------
  // ISA — pad sender/receiver IDs to exactly 15 chars per X12 spec
  const submitterId = bNpi.padEnd(15, " ");
  const payerIdPad = input.payerId.padEnd(15, " ");

  // ISA is a fixed-width segment — build manually
  const isaLine = `ISA${ELEMENT_SEPARATOR}00${ELEMENT_SEPARATOR}          ${ELEMENT_SEPARATOR}00${ELEMENT_SEPARATOR}          ${ELEMENT_SEPARATOR}ZZ${ELEMENT_SEPARATOR}${submitterId}${ELEMENT_SEPARATOR}ZZ${ELEMENT_SEPARATOR}${payerIdPad}${ELEMENT_SEPARATOR}${dateISA}${ELEMENT_SEPARATOR}${time}${ELEMENT_SEPARATOR}^${ELEMENT_SEPARATOR}00501${ELEMENT_SEPARATOR}000000001${ELEMENT_SEPARATOR}0${ELEMENT_SEPARATOR}P${ELEMENT_SEPARATOR}${COMPOSITE_SEPARATOR}${SEGMENT_TERMINATOR}`;

  // GS — Functional Group Header
  const gsLine = seg("GS", "HC", bNpi, input.payerId, dateGS, time, "1", "X", "005010X223A2");

  // ST — Transaction Set Header
  const stLine = seg("ST", "837", "0001", "005010X223A2");

  // BHT — Beginning of Hierarchical Transaction
  // BHT06: CH = chargeable (original), RU = resubmission/replacement, void uses void indicator
  // Per 837I spec BHT06 is always "CH" for original and replacement; void uses "31"
  const bht06 = input.billType === "void" ? "31" : "CH";
  const bhtLine = seg("BHT", "0019", "00", input.claimId, dateGS, time, bht06);

  // ------------------------------------------------------------------
  // Loop 1000A — Submitter
  // ------------------------------------------------------------------
  const nm1Submitter = seg("NM1", "41", "2", bName, "", "", "", "", "XX", bNpi);
  const perLine = seg("PER", "IC", "BILLING CONTACT", "TE", "0000000000");

  // ------------------------------------------------------------------
  // Loop 1000B — Receiver (Payer)
  // ------------------------------------------------------------------
  const nm1Receiver = seg("NM1", "40", "2", "PAYER NAME", "", "", "", "", "PI", input.payerId);

  // ------------------------------------------------------------------
  // Loop 2000A — Billing Provider Hierarchical Level
  // ------------------------------------------------------------------
  const hl2000a = seg("HL", "1", "", "20", "1");
  const prvLine = seg("PRV", "BI", "PXC", HOSPICE_TAXONOMY);
  const nm1BillingProv = seg("NM1", "85", "2", bName, "", "", "", "", "XX", bNpi);
  const n3Line = seg("N3", "123 MAIN ST");
  const n4Line = seg("N4", "CITY", "ST", "00000");
  const refEI = seg("REF", "EI", bTaxId);

  // ------------------------------------------------------------------
  // Loop 2000B — Subscriber Hierarchical Level
  // ------------------------------------------------------------------
  const hl2000b = seg("HL", "2", "1", "22", "0");
  // SBR — Subscriber Information: P=primary, 18=self, MC=Medicare
  const sbrLine = seg("SBR", "P", "18", "", "", "", "", "", "MC");
  const nm1Patient = seg("NM1", "IL", "1", ptLast, ptFirst, "", "", "", "MI", memberId);
  const dmgLine = seg("DMG", "D8", ptDob, "U");
  const nm1Payer = seg("NM1", "PR", "2", "PAYER NAME", "", "", "", "", "PI", input.payerId);

  // ------------------------------------------------------------------
  // Loop 2300 — Claim Information
  // ------------------------------------------------------------------
  // CLM05 composite: facility-code:bill-classification:freq-code
  // 8 = hospital/SNF (used for hospice inpatient), B = special facility, freq per bill type
  const clm05 = composite("8B", "B", freq);
  const clmLine = seg("CLM", input.claimId, input.totalCharge, "", "", clm05, "Y", "A", "Y", "I");

  // DTP*434 — Statement Covers Period
  const dtpStatement = seg("DTP", "434", "RD8", `${fromD8}-${toD8val}`);

  // REF*F8 — Prior authorization / original claim ICN (replacement/void only)
  const refF8Lines: string[] = [];
  if ((input.billType === "replacement" || input.billType === "void") && input.priorClaimIcn) {
    refF8Lines.push(seg("REF", "F8", input.priorClaimIcn));
  }

  // ------------------------------------------------------------------
  // Loop 2400 — Service Lines
  // ------------------------------------------------------------------
  const serviceLineSegments: string[] = [];
  input.lines.forEach((line, idx) => {
    const lineNum = (idx + 1).toString();
    const lxLine = seg("LX", lineNum);

    // SV2: revenue code, composite procedure code, charge, unit basis, units
    const procedureComposite = line.hcpcsCode ? composite("HC", line.hcpcsCode) : composite("HC");
    const sv2Line = seg(
      "SV2",
      line.revenueCode,
      procedureComposite,
      line.lineCharge.toFixed(2),
      "UN",
      line.units.toString(),
    );

    const dtpService = seg("DTP", "472", "D8", toD8(line.serviceDate));

    serviceLineSegments.push(lxLine, sv2Line, dtpService);
  });

  // ------------------------------------------------------------------
  // Assemble all segments that count toward SE segment count
  // SE segment count = ST through SE inclusive
  // ------------------------------------------------------------------
  const transactionSegments: string[] = [
    stLine, // 1
    bhtLine, // 2
    nm1Submitter, // 3
    perLine, // 4
    nm1Receiver, // 5
    hl2000a, // 6
    prvLine, // 7
    nm1BillingProv, // 8
    n3Line, // 9
    n4Line, // 10
    refEI, // 11
    hl2000b, // 12
    sbrLine, // 13
    nm1Patient, // 14
    dmgLine, // 15
    nm1Payer, // 16
    clmLine, // 17
    dtpStatement, // 18
    ...refF8Lines, // 19 (optional)
    ...serviceLineSegments,
    // SE added below after counting
  ];

  const seSegmentCount = transactionSegments.length + 1; // +1 for SE itself
  const seLine = seg("SE", seSegmentCount.toString(), "0001");

  // ------------------------------------------------------------------
  // Functional Group / Interchange trailer
  // ------------------------------------------------------------------
  const geLine = seg("GE", "1", "1");
  const ieaLine = seg("IEA", "1", "000000001");

  segments.push(isaLine, gsLine, ...transactionSegments, seLine, geLine, ieaLine);

  return segments.join("");
}

// ---------------------------------------------------------------------------
// Hash helpers
// ---------------------------------------------------------------------------

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Public service class
// ---------------------------------------------------------------------------

// biome-ignore lint/complexity/noStaticOnlyClass: service namespace pattern
export class X12Service {
  /**
   * Generates an 837I X12 transaction set for the given claim input.
   * Returns the X12 string plus SHA-256 hashes of both the input payload
   * and the generated X12 string.
   */
  static generate(input: X12GeneratorInput): X12GeneratorOutput {
    const payloadHash = sha256Hex(JSON.stringify(input));
    const x12 = buildX12(input);
    const x12Hash = sha256Hex(x12);

    return { x12, payloadHash, x12Hash };
  }
}
