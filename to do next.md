## Secure Chat – Authentication & Contacts PRD

### 1) Overview
Enhance the secure-chat app’s authentication with secure JWT session strategy, phone number verification via OTP during registration, consistent error handling, hardened security, and tighter Socket.IO auth. Align contact features to verified users and improve frontend behavior for recipients and sessions.

### 2) Goals
- Add phone number and OTP verification to the registration flow.
- Standardize auth responses and error handling across endpoints.
- Use secure cookies for tokens; rotate refresh tokens; add rate limits.
- Enforce verified phone prerequisite for friend/contact actions.
- Ensure Socket.IO sessions are authenticated and user presence updates are reliable.

- Borrow proven concepts from code-editor:
  - JWT session payload consistently carries user id, email, name, role.
  - Role-based authorization surface (extend later for admin/premium features).
  - Central route protection registry (public/auth/protected) enforced by middleware.
  - Server-side helpers to fetch current user and account info patterns (Express version).

### 3) Non-Goals
- Replacing the existing email verification flow (kept as-is, optional to use both).
- Rewriting the frontend to a framework; keep current vanilla JS.

### 4) Session & Token Strategy
- Access token: short-lived JWT (e.g., 15m) delivered via httpOnly, Secure, SameSite=Lax cookie `accessToken`.
- Refresh token: long-lived JWT (e.g., 7–30d) via httpOnly, Secure, SameSite=Strict cookie `refreshToken` with rotation.
- CSRF: issue `X-CSRF-Token` via non-httpOnly cookie or response header; require it on state-changing requests with `credentials: 'include'`.
- Token rotation: on each refresh, rotate refresh token and invalidate prior one (store `tokenVersion` on user or keep a denylist).

- JWT claims (align with code-editor patterns):
  - `{ sub: userId, email, name: username, role }` where `role ∈ { USER, ADMIN, PREMIUM_USER }`.
  - Map these to `req.user` in Express middleware for downstream authorization.

### 5) Database Model Changes (User)
Add to `User`:
- phone: string (E.164), unique, indexed
- phoneCountryCode: string
- isPhoneVerified: boolean (default false)
- phoneOtpHash: string (SHA-256 of OTP)
- phoneOtpExpiry: Date
- phoneOtpAttempts: number (reset rolling window)
- phoneOtpLastSentAt: Date
- tokenVersion: number (default 0) for refresh rotation
- role: enum ['USER','ADMIN','PREMIUM_USER'] (default 'USER') – to mirror code-editor role handling

Fix duplicate index warnings in:
- FriendRequest: keep a single compound index on { fromUserId, toUserId } unique.
- BlockList: keep one compound { userId, blockedUserId } unique.

### 6) APIs – Auth
- POST /api/v1/auth/register
  - body: { username, email, password, phone }
  - creates user (isEmailVerified optional), sets isPhoneVerified=false, no access issued until phone verified.
- POST /api/v1/auth/request-phone-otp
  - body: { phone }
  - rate-limited; generate 6-digit OTP; store SHA-256 hash + expiry (10m); cool down 60s; max N/day.
- POST /api/v1/auth/verify-phone-otp
  - body: { phone, otp }
  - verify hash/expiry/attempts; on success set isPhoneVerified=true; issue access/refresh cookies.
- POST /api/v1/auth/login
  - body: { email, password } → set cookies; record lastLoginAt.
- POST /api/v1/auth/refresh-token
  - cookie refreshToken required; rotate token; bump tokenVersion; detect reuse.
- POST /api/v1/auth/logout
  - clear cookies; optionally bump tokenVersion to invalidate all.
- GET /api/v1/auth/current-user
  - returns { username, email, phone, isPhoneVerified } from access token.

Optional:
- POST /api/v1/auth/login-phone (OTP only) – same OTP flow without password.
- Future (borrowed from code-editor):
  - OAuth via Google/GitHub as optional providers. On first sign-in, create user and link provider account. Maintain role in JWT.

### 7) APIs – Contacts (guarded)
- All contact/friend endpoints require valid access token AND isPhoneVerified=true.
- Return standardized payloads: { success, data, message, code }.

### 8) Validation & Error Handling
- Use validators for register/login/OTP with consistent 422 responses.
- Central error handler normalizes to { success:false, message, code }.
- Map client errors via status→message table (already present in frontend) and preserve shape.

### 9) Security
- Cookies: httpOnly, Secure, SameSite; CORS tightened to allowed origins.
- Rate limit: /login, /register, /request-phone-otp, /verify-phone-otp.
- Helmet, HPP, input sanitization.
- Password policy: min length 8+, recommend zxcvbn check (optional).
- Refresh reuse detection → revoke session and alert.
- Auth middleware hardening: block unverified accounts from contacts; ensure role-aware guards for any admin endpoints.

### 10) Socket.IO Auth & Presence
- Require valid access token in `io.use`. If invalid, reject connection.
- On connect: attach `socket.user = { id, email, username }`.
- On `userLogin`: de-dupe username; broadcast presence; immediately emit updated user list to all.
- On disconnect: remove and broadcast.

### 11) Frontend Changes (public/script.js)
- Use `credentials: 'include'` for all auth/contacts requests; supply `X-CSRF-Token` header.
- Registration flow:
  1) submit username/email/password/phone → pending account
  2) request OTP → input modal
  3) verify OTP → on success, backend issues cookies; connect to Socket.IO
- Recipient dropdown: built from contacts plus online users (done). Continue to exclude self.
- Session data parity with code-editor:
  - After login/verify, backend returns session payload with `username, email, role` and sets cookies; UI may display role if needed.
  
### 12) Route Protection Registry (adopted from code-editor)
- Create an Express-based route registry:
  - `publicRoutes`: no auth needed (e.g., `/`, `/test`)
  - `authRoutes`: authentication pages/APIs that should redirect when logged in (UI-specific)
  - `protectedRoutes`: default for API; enforce `verifyJWT` + `isPhoneVerified`
- Implement a middleware that checks path against the registry and enforces the correct behavior.

### 13) Observability
- Log auth events (register, OTP send/verify, login, refresh, logout) with userId and IP (PII safe).
- Metrics: OTP send rate, verify success rate, login success rate, refresh success/fail, rate-limit hits.

### 14) Acceptance Criteria
- Register with phone, receive OTP, verify successfully → tokens set in cookies; `current-user` returns expected fields.
- Rate limiting blocks excessive OTP requests and login attempts.
- Unverified phone cannot use contact endpoints (returns 403 with code `PHONE_NOT_VERIFIED`).
- Socket connection rejected without valid access token.
- Duplicate index warnings removed on server start.
- Frontend recipient select shows other logged-in users and contacts; messages deliver as expected.
- JWT contains `sub, email, name, role`; `req.user` populated similarly. Role is persisted in DB and can be used for authorization checks.

### 15) Rollout Plan
- Phase 1: DB migrations and index fixes.
- Phase 2: Add OTP endpoints + SMS provider stub; feature flag OTP gating.
- Phase 3: Switch auth storage to cookies + CSRF; update frontend requests.
- Phase 4: Enforce Socket.IO auth; monitor metrics; remove flag.
- Phase 5: Optional OAuth providers (Google/GitHub) following code-editor pattern; map provider profile → User; store/emit `role` in JWT.

### 16) Risks & Mitigations
- SMS deliverability: abstract provider; add fallback/testing channel (console/email in dev).
- Token rotation bugs: unit tests and short TTL for access tokens; safe fallback to re-login.
- UX friction: clear UI for OTP steps; resend OTP with cooldown and indicator.
- Introducing roles without UI may confuse users; hide role UI initially and use server-side checks where needed.

### 17) Open Questions
- Should email verification remain mandatory or optional when phone is verified?
- What OTP provider to use in production (Twilio, AWS SNS, etc.)?
- Do we want to add OAuth providers now or after OTP rollout?

### 18) Technology Options and Migration Plan (Next.js + Prisma)

Decision context: current app is Express + Socket.IO + Mongoose, working and close to feature goals. The code-editor app demonstrates Next.js App Router + Auth.js + Prisma with strong auth ergonomics.

Option A — Keep Express/Mongoose (near-term)
- Pros: Minimal churn; fastest to deliver OTP + hardened JWT + contacts; Socket.IO already integrated.
- Cons: Less batteries-included auth ergonomics vs Auth.js; manual session/cookie/CSRF handling.

Option B — Adopt Next.js + Prisma + Auth.js (mid/long-term)
- Pros: Mature auth flow (providers, JWT/session callbacks), file-system routing, SSR/ISR, strong DX; Prisma schema and adapters; easy role propagation; middleware route gating.
- Cons: Migration effort (routing, controllers, Socket.IO integration via custom server or serverless websockets), reworking the public frontend and API shape.

Recommended path
1) Short-term: Stay on Express/Mongoose; implement all sections above (OTP, cookies, CSRF, rate limiting, verified contacts, Socket.IO auth).
2) Medium-term (Phase 5+): Introduce OAuth providers to Express (optional). In parallel, prototype a Next.js frontend that consumes existing Express APIs. Keep Express as the API + Socket.IO backend.
3) Long-term (optional full adoption): Migrate API endpoints to Next.js App Router (route handlers), move auth to Auth.js + Prisma, keep Socket.IO via a Next custom server or move to a managed realtime service.

If adopting Next.js + Prisma now (delta requirements)
- Add Next.js App Router with Auth.js using Prisma Adapter targeting MongoDB (DATABASE_URL) or Postgres if preferred.
- Implement providers (Google/GitHub) with callbacks mirroring code-editor: create/link accounts on sign-in, enrich JWT with id/email/name/role.
- Replace manual session issuance with Auth.js session/JWT. Preserve phone OTP by adding custom API routes (`/api/otp/request`, `/api/otp/verify`) and updating Prisma `User` model with phone fields.
- Add middleware route registry for public/auth/protected routes. Gate protected pages with `auth()` server-side checks.
- Retain or re-implement Socket.IO: either custom Next server or use a dedicated Node server for websockets and have Next.js as the UI/API.

Migration milestones
- M0: Express stable (OTP + cookies + CSRF + Socket.IO auth) — production ready.
- M1: Next.js UI reads from Express APIs (keep Express backend). Migrate login/register to Auth.js, bridge tokens via cookies.
- M2: Move selective endpoints to Next.js route handlers; Prisma mirrors Mongoose data model or perform one-time migration.
- M3: Consolidate: Next.js full-stack, Express remains only for Socket.IO or replaced by Next custom server.

Trade-offs summary
- Performance: Both stacks are fine; Next.js adds SSR; Express is simpler for websockets.
- Team velocity: Auth.js + Prisma can speed auth features; Express remains simpler infrastructure.
- Risk: Full migration adds complexity; phased approach mitigates.


