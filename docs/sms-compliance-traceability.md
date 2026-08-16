# SMS/MMS Compliance Traceability

Maps `GROVEIQ_TWILIO_SMS_REQUIREMENTS.md`'s requirements to what was
actually built, per section 19.8's instruction to provide this table.
Structured against section 17's pre-submission checklist since that's
already the most actionable format in the source doc.

Last updated: 2026-08-16.

## Policies and public evidence

| Item | Status | Files | Notes / blockers |
|---|---|---|---|
| `/privacy` returns 200 without login, contains SMS section | ⚠️ Built, not yet verified live | `frontend/public/privacy/index.html` | Static HTML, not a React route — works for any HTTP client without JS. Currently returns 302 to Access login (whole `grove-iq.com` is gated); needs a Cloudflare Access Bypass policy scoped to this path. **Verification pending user confirming the bypass is added.** |
| Non-sharing statement present | ✅ Done | same file | Verbatim from spec section 4, adapted for a single-operator project |
| Frequency/rates/STOP/HELP/retention/support disclosed | ✅ Done | same file | Retention stated as "active enrollment + 4 years" — a reasonable default, **not reviewed by counsel** (doc's own front matter requires this before real production launch) |
| `/terms` returns 200, no login/download | ⚠️ Same blocker as `/privacy` | `frontend/public/terms/index.html` | |
| Terms include program description, consent, frequency, rates, STOP/HELP, carrier disclaimer, Privacy link | ✅ Done | same file | |
| Effective/updated dates shown; legal review complete | ⚠️ Dates shown, legal review **not done** | both files | Individual (Kyle Ryan), not a registered business — per user's own choice when asked |

## Consent UX

| Item | Status | Files | Notes |
|---|---|---|---|
| Operational checkbox separate, optional, unchecked by default | ✅ Done | `frontend/src/screens/NotificationSettings.tsx` | `consentChecked` state initializes `false` |
| No marketing checkbox exists | ✅ Done (N/A) | — | Marketing program out of scope per spec section 9; nothing built |
| User can continue without SMS consent | ✅ Done | `NotificationSettings.tsx` | Verification proceeds regardless of checkbox state; consent event only recorded if checked (`routes/notifications.ts` `handleVerificationStart`) |
| Disclosure copy matches approved version, visible at consent time | ✅ Done | `sms/policyVersions.ts`, fetched via `/api/v1/sms/consent-text` | Single source of truth — frontend never hardcodes its own copy, so displayed and recorded text can't drift |
| Phone verification distinct from consent | ✅ Done | `sms/otp.ts`, `routes/notifications.ts` | Verifying does not itself grant consent; only promotes an already-pending `granted` event to `active` |
| Literal opt-in confirmation message sent | ✅ Done (2026-08-15) | `sms/policyVersions.ts` `OPT_IN_CONFIRMATION_TEXT`, sent from `routes/notifications.ts` `handleVerificationConfirm` | Was a real gap until now — the OTP message explicitly says it does *not* enroll the user, and nothing else sent a confirmation. Fires once, right after verification completes with consent active, via `sendSms()` directly (not category-gated — no category is enabled yet at this point) |
| All categories default Off | ✅ Done | migration `0009_sms_compliance.sql` (`sms_category_subscriptions`), `NotificationSettings.tsx` | No row = disabled, `authorizeOperationalSend` treats missing row as `category_disabled` |
| Phone change invalidates prior verification/subscriptions | ⚠️ Partial | `sms/consent.ts` `getOrCreatePhoneContact` | A new number creates a new `phone_contacts` row (correctly starts unverified/no subscriptions) — but there's no UI flow yet for *changing* an already-verified number; today the only path is verifying a fresh number |
| Accessibility review | ❌ Not done | — | Standard HTML form elements (real `<input type="checkbox">`, labels wrapping inputs) but no formal a11y audit performed |

## Backend and security

| Item | Status | Files | Notes |
|---|---|---|---|
| Consent events store exact text/version, timestamps, source, program, categories, policy versions | ✅ Done | `sms/consent.ts` `recordConsentEvent`, migration `0009` `sms_consent_events` | |
| Current state derived/reconciled from append-only evidence | ✅ Done | `sms/consent.ts` | `sms_subscription_state` is written only as a side effect of `recordConsentEvent`, never mutated directly elsewhere |
| Twilio webhook signature validation, tested in production topology | ⚠️ Implemented, **not live-tested** | `sms/twilio.ts` `validateTwilioSignature`, `routes/twilioWebhook.ts` | Can't test with real Twilio traffic until the Access bypass is added (Twilio can't complete a GitHub login) |
| Webhook idempotent | ✅ Done | `twilioWebhook.ts` | Unique index on `sms_consent_events.twilio_message_sid`; duplicate insert caught and treated as already-processed |
| STOP atomically suppresses all sends | ✅ Done | `twilioWebhook.ts`, `sms/consent.ts` | Sets `global_opt_out`, disables every category in the same handler |
| Every send path re-checks current state | ✅ Done | `sms/sendService.ts` `sendOperationalSms` | The *only* function that calls `sms/twilio.ts`'s `sendSms` for operational alerts; `alerts.ts` goes through it, nothing bypasses it |
| Provider unsubscribe errors update local state | ❌ Not done | — | No handling for Twilio's async delivery-status webhook or error 21610 specifically; STOP keyword handling covers the common case |
| OTP protections, phone redaction | ✅ Done | `sms/otp.ts`, `sms/crypto.ts` `redactPhone` | 10-min expiry, 5 attempts/challenge, 5 sends/hour, 30s cooldown, hashed code storage |
| Retention/deletion/access-control docs | ⚠️ Partial | `/privacy` states retention; no deletion workflow built | Doc section 10.4's "data deletion workflow" (keyed-hash suppression proof) not implemented — no deletion requests possible yet since this is single-user |

## Twilio configuration and registration

| Item | Status | Notes |
|---|---|---|
| Production traffic uses a registered A2P campaign | ⏳ In progress, 3 rejections so far | Rejection 1 (30909 — Message Flow/Call to Action lacked opt-in detail), rejection 2 (30893/30908/30886 — sample/use-case mismatch, privacy not verified, unclear description), rejection 3 (30908/30886 persisted even after applying the round-2 fix). Brand is registered **Sole Proprietor** ("Starter" use case) — confirmed via Twilio's own docs that this tier has exactly one use case available, no "Mixed" option to switch to, so all 3 rounds' fixes have been content-only. Round 3 fix (2026-08-16): tightened the campaign description to frame OTP as a step *within* the one alert program rather than a second purpose, and added Twilio's literal documented required sentence for 30908 ("We do not share, sell, or provide your mobile phone number or messaging consent data to third parties or affiliates for marketing or promotional purposes.") to both `/privacy` and the Message Flow field — the prior paragraph was semantically equivalent but not a literal match, which manual A2P vetting appears to require |
| STOP/HELP/START tested end-to-end from a real handset | ❌ Blocked | Can't test until campaign approves (unregistered number is carrier-blocked, confirmed via Twilio error 30034 on the first live OTP test) |
| Campaign content matches production behavior | ✅ Verified against code 2026-08-15 | Sample messages for resubmission pulled directly from `sms/otp.ts`, `sms/policyVersions.ts` (including the new `OPT_IN_CONFIRMATION_TEXT`), and `alerts.ts` — not just assumed to match |
| `PrivacyPolicyUrl`/`TermsAndConditionsUrl` populated | ✅ Done | `https://grove-iq.com/privacy` / `/terms` — confirmed live via curl 2026-08-15, both return a clean `200` (redirects to trailing-slash form, no Access login block) |
| Opt-out/Help auto-reply text matches Twilio's Advanced Opt-Out config | ⚠️ Unverified | The app sends empty TwiML for STOP/HELP — actual reply text is whatever's configured in Twilio Console → Messaging → Advanced Opt-Out. **Not cross-checked against what was entered in the campaign form's Opt-Out Message / Help Message fields** — verify these match before submitting |

## Definition of done — current state

Per section 18: **not done yet.** Concretely blocking:
1. ~~Cloudflare Access bypass for `/privacy`, `/terms`~~ — resolved, both confirmed returning `200` live 2026-08-15
2. Twilio A2P 10DLC campaign approval (external, Twilio's timeline) — 3 rejections so far (30909; then 30893/30908/30886; then 30908/30886 again), resubmitted 2026-08-16 with a tightened single-purpose description and Twilio's literal required non-sharing sentence
3. Handset-level STOP/HELP/START test (blocked by #2)
4. Legal review of Privacy Policy / Terms content (explicitly required by the source doc's own front matter before real production launch)
5. Accessibility audit (not started)
6. Phone-number-change UI flow (not built)
7. Cross-check Twilio Advanced Opt-Out's configured STOP/HELP reply text against what was entered in the campaign form (see table above)

Everything else — the technical consent/verification/send/webhook system — is built and internally consistent with the spec.
