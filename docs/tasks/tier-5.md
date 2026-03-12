# Tier 5 — Mobile & Offline

> **Do not start until Phase 6 exit gate is signed off and web app is stable in production.**
>
> 80%+ of hospice documentation occurs in patient homes without reliable internet. Mobile is a **purchase-critical** feature — primary differentiator vs Firenote (which has no mobile app). Plan for PWA as intermediate delivery before native apps.
>
> **PHI rule (active now, always):** PHI must never be in `localStorage` or `sessionStorage`. This applies regardless of phase.

---

## T5-1 · Mobile strategy decision

PWA (fastest to market) vs React Native / Expo.

Evaluate: field clinician device landscape, budget, offline requirements, team capability.

**Decision criteria:** Time to market, offline capability depth, maintenance burden, app store requirement.

---

## T5-2 · Offline sync scope definition

Define what is **offline-capable** vs **online-only**:

| Capability | Offline? | Notes |
|------------|----------|-------|
| Patient census | ✅ | Core |
| Care plan | ✅ | Read + write |
| Visit notes | ✅ | Primary use case |
| Pain assessments | ✅ | Field charting |
| Billing / admin | ❌ | Online only |
| HOPE submissions | ❌ | Online only |

---

## T5-3 · IndexedDB schema

- Dexie or similar
- **PHI cache encrypted via Web Crypto API — never plain IndexedDB**
- Schema must mirror online models for seamless sync

---

## T5-4 · Mutation queue

- Buffer writes offline
- Drain on reconnect
- Idempotent operations (retry-safe)

---

## T5-5 · Conflict resolution

- Version vectors per record
- UI diff surface — clinician must resolve
- Audit log entry per resolution
- **Last-write-wins is NOT acceptable for clinical data**

---

## T5-6 · `clearOfflineData()` on logout

- Wipe IndexedDB cache
- Clear mutation queue
- Clear all PHI from Web Crypto key store

---

## T5-7 · EVV (Electronic Visit Verification)

- GPS-based visit verification
- 21st Century Cures Act requirement
- Capture location on note open + close

---

## T5-8 · On-device signature capture

- Patient/family signature on consents and care plan acknowledgements
- Store as base64 image + timestamp in encounter record
- Tamper-evident (hash stored in audit_logs per T3-5 pattern)

---

## T5-9 · Visit GPS snapshot audit trail

- GPS location snapshot on note open and note close
- Stored in encounter's audit trail
- Delta between open/close GPS validates clinician presence
