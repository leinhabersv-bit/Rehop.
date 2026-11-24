# Paste this prompt into Antigravity

You are implementing the **ReHop** booking-side frontend for a hackathon. I have attached a ZIP named `ReHop_Antigravity_Visual_References.zip`. Extract it and use its screenshots as strict *visual references*, not as assets to stretch onto the page.

## Source of truth

1. Read the repository's `AGENTS.md`, `README.md`, shared TypeScript contracts and existing architecture first.
2. Read the pack's `README_FOR_ANTIGRAVITY.md`, `DESIGN_TOKENS.json`, and `SCREEN_COPY.md`.
3. Study `01_Landing_Desktop.png` through `06_Booking_Confirmation.png` in order. Use `08_Design_System.png` for visual tokens. `00_Cinematic_Brand_Concept.png` and `09_Master_Moodboard.png` are supplementary inspiration.
4. Recreate the designs as **real, functional Next.js + React + TypeScript + Tailwind CSS components**, with Lucide icons and keyboard-accessible controls. Do not insert screenshots as backgrounds or fake an app with a static image.

## My ownership as Frontend Developer 2 (lighter workload, ~30%)

Implement landing, booking, typed ride request, extracted-intent review, simulated comparison and booking confirmation. Also build reusable buttons, inputs, ride cards and status badges. Do **not** modify backend, API contract types, driver tracking, risk policy, recovery logic or WebSocket infrastructure. `07_Live_Tracking_Handoff.png` is an integration reference owned by Frontend Developer 1.

## Must-have behavior

- Pickup and destination inputs plus max budget, vehicle type and `need_by` arrival deadline.
- AI request review must show editable parsed fields; use the repository's existing contract, not an invented endpoint.
- Provider choices are strictly `Provider A`–`Provider D`, with conspicuous simulation labelling. No real cab brand names or logos.
- Display quote expiry, loading, zero-results and error states.
- Booking confirmation only after receiving a valid backend confirmation or an explicitly labelled simulated confirmation.
- Clicking **Track your ride** goes to the lead frontend's journey route with the real `journeyId`.
- Keep primary color `#B9FF45`, background `#090F1D`, surfaces `#151F32`, and status colors in the token file.
- Build mobile-first but match the desktop landing reference too.

Before coding, produce a brief file-by-file plan. Implement one screen at a time. After each screen, report changed files and tests; run lint, TypeScript check and build when available. Keep changes on branch `feat/booking-ui` and do not merge directly into main.

Remember: this is a simulated, ONDC/Beckn-inspired hackathon demonstrator, not a live booking integration. The LLM can interpret intent; only the backend policy authorizes actions.
