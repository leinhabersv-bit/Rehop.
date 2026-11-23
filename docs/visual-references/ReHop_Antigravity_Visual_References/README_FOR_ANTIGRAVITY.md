# ReHop — Antigravity Visual Reference Pack

**Purpose:** The images are visual direction for implementing the booking UI of the ReHop simulated ride-recovery hackathon project. They are not screenshots of a working product. Recreate the pages as real, accessible React/Next.js components rather than embedding these PNGs as a UI.

## What to build (Frontend Developer 2, approximately 30% of the frontend)

1. `01_Landing_Desktop.png`, `02_Landing_Mobile.png`: responsive landing/home.
2. `03_Ride_Booking.png`: pickup/destination, natural-language request field, budget, vehicle category and **need_by** arrival deadline.
3. `04_AI_Request_Review.png`: show structured fields extracted from a typed ride request; user can confirm/edit them. Use the existing API contract; do not invent a new parsing endpoint.
4. `05_Provider_Comparison.png`: simulated quotes from Provider A/B/C/D, ranked by suitability and urgency; user selects one.
5. `06_Booking_Confirmation.png`: present booking details, reassuring status and a **Track your ride** CTA that routes to the Lead Frontender's journey page.
6. `07_Live_Tracking_Handoff.png`: visual integration reference **only**; this screen is owned by Frontend Developer 1.
7. `08_Design_System.png`: palette, status colors, type scale and component style.
8. `00_Cinematic_Brand_Concept.png` and `09_Master_Moodboard.png`: high-level visual inspiration; exact on-screen wording in generated concepts is illustrative.

## Design tokens

- Primary lime `#B9FF45`; dark background `#090F1D`; surface `#151F32`; alternate surface `#243249`; white text `#F6F8FC`; muted text `#98A5BC`.
- Status: success `#2ED389`; warning `#FFBD63`; danger `#FF6D76`; AI accent `#B79CFF`.
- Fonts: Inter, fallback to system sans-serif. Headlines 800–850 weight. Rounded components: cards 18–22px; primary buttons 16px radius.
- Spacing: 8px base. Desktop hero screenshot: 1440×900; mobile page references: 430×932. Implement responsively, not as absolute screenshots.
- Icons: Lucide React outlined strokes; bright accents only for primary actions and key status.

## Copy and truthfulness

- Product name: **ReHop**. Tagline: **Your ride. No interruptions.**
- **All providers are neutral simulation entities**, named Provider A–D. No Uber, Ola, Rapido, or RedTaxi branding.
- Fares/ETAs/driver locations on these screens are demo values only; show a clear simulation indicator.
- **need_by** is the user's required arrival deadline, not just a decorative date field.
- The AI interprets intent; backend policy authorizes bookings/cancellations. No frontend should call provider endpoints directly or auto-confirm payments.
- Before a replacement, fresh quote validation and cancellation-fee disclosure are owned by the backend and live recovery frontend (not this developer).

## Integration boundaries

Follow the actual repository's `AGENTS.md`, README, shared API types and contract files even if folder names differ from an image caption. Lead Frontend owns shared types, API client, WebSocket logic and journey tracking. This developer owns booking views and reusable UI visual components. Mock data is acceptable while contracts are being wired, but never misrepresent demo data as live.

## Implementation acceptance checklist

- Routes render on desktop and mobile; no overflow or clipping.
- Pickup, destination, budget and `need_by` validate correctly.
- Request review fields are editable; no inferred details hidden from the user.
- Comparison handles loading, no options, errors and expired quotes.
- Booking confirmation appears only after backend confirmation (or explicitly simulated success).
- `Track your ride` passes the **journey ID** to Frontend 1's route.
- No hardcoded third-party branding, secret keys, or unauthorized scraping.
- Run lint, typecheck and production build; document results.
