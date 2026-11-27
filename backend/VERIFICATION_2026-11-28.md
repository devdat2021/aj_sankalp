# Verification — 28 November 2026 (Asia/Calcutta)

## Backend workflows

Full suite: **117 passed**. Covers existing workflows, authorization, stale/duplicate decisions,
dependency analysis, provider response validation and Gemini fallback behavior. Existing deprecation
warnings remain. No credentials or actual `.env` files were changed during verification.

## Real Google and Gemini integration

`verify_operational.py --analyze-current` returned **completed** using configured MongoDB records.
Google's recent, validated real optimization result was reused from cache. Gemini's configured
`gemini-3.8-flash` returned HTTP 503; the bounded fallback `gemini-3.1-flash-lite` returned a structured
operational review that passed grounding validation and was persisted. This is evidence that the key
can generate content; it is not an invalid-key failure. Google ADC/optimization previously succeeded.

The completed run produced pending schedule recommendation
`c4e8456f-a2ba-481b-8838-3ab7c7b3fad8`. It was not approved during this verification.
The application correctly reports TRK-102 availability as unconfirmed rather than inventing capacity.
Earlier persisted dispatch-hold execution and notifications to all four roles were confirmed by the
read phase of the verification script. This run does not claim a new live approval/execution test.

## Frontend checks

**17 tests passed**, **ESLint passed**, **TypeScript/Vite production build passed**.
The build reports a large JavaScript bundle warning. Concurrent test Vite instances reported an HMR
port collision warning, but all tests passed. `git diff --check` passed.

## Browser and UI limitations

Ports 8001 and 5173 were already occupied. A separate frontend was started at 5174 for inspection.
Browser access to that origin was declined, so no rendered browser walkthrough was completed.
No alternate browser/network mechanism was used to bypass the denial.

The UI simplification requested in the preceding task has **not** been implemented. The existing
panel still displays extensive provider details/forms and uses the first overall analysis rather
than selecting the latest analysis for the chosen shipment. Passing component/build checks does
not establish that this UX is satisfactory or that every browser interaction works.

Conclusion: automated checks and one real grounded analysis pass. The primary Gemini model is
still unavailable, the fallback works, and full UI/interaction acceptance remains outstanding.
