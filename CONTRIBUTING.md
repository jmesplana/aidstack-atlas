# Contributing to Aidstack Atlas

Thanks for wanting to improve Aidstack Atlas. This project is used to support
humanitarian response, public-health programmes, and field operations, so
correctness and clarity matter more here than velocity.

---

## Licence and the CLA — read this first

Aidstack Atlas is licensed under the **GNU Affero General Public License v3.0 or
later** ([LICENSE](LICENSE)).

**Before your first pull request can be merged, you must agree to the
[Contributor License Agreement](CLA.md).**

In short, the CLA says:

- **You keep ownership of your contribution.** It is a licence, not an
  assignment.
- You grant the project owner a broad, irrevocable copyright and patent licence
  to your contribution.
- The owner may relicense the project — including your contribution — under the
  AGPL or under commercial terms.

To agree, include this line in your pull request description:

```
I have read and agree to the Aidstack Atlas Contributor License Agreement (CLA.md).
```

If you are contributing as part of your job, or your employment contract assigns
your work product to your employer, your employer needs to sign a Corporate CLA
first — email **johnm.esplana@gmail.com**.

### What AGPL means for you as a user

You can use, self-host, modify, and redistribute Atlas freely. The condition is
reciprocity: **if you run a modified version as a network service, you must
offer your users the complete corresponding source of your modified version.**
Keeping improvements private and hosted is the one thing the licence does not
allow.

If you need to build on Atlas without those obligations, a commercial licence is
available — email **johnm.esplana@gmail.com**.

---

## Before you start

For anything beyond a small fix, **open an issue first** and describe what you
intend to change. Atlas has several architectural constraints that are easy to
violate accidentally, and a short conversation up front saves a rejected PR.

---

## Development setup

```bash
git clone https://github.com/jmesplana/aidstack-atlas.git
cd aidstack-atlas
npm install
```

Node **22.x** is required (see `engines` in `package.json`).

Create `.env.local`:

```
OPENAI_API_KEY=sk-proj-...
APP_BASE_URL=http://localhost:3000
GEE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
```

Never commit `.env.local` or any real key. It is gitignored — keep it that way.

```bash
npm run dev            # Dev server at localhost:3000
npm run build          # Production build
npm test               # Unit tests (node --test over tests/*.test.js)
npm run test:browser   # Playwright browser tests (baseURL :3010)
```

---

## Architectural rules

These are not style preferences. Breaking them breaks the product.

**JavaScript only — no TypeScript.** Do not add `.ts`/`.tsx` files or type
annotations.

**Leaflet cannot be server-rendered.** Every Leaflet-dependent component must be
dynamically imported with `{ ssr: false }`.

**Heavy processing runs client-side.** Data processing lives in `lib/` and runs
in the browser (optionally in a Web Worker) to avoid 413 payload errors and
serverless timeouts. API routes handle AI narrative generation only. See
`lib/impactAssessment.js` and `lib/trendAnalysis.js` for the pattern.

**The app bridge is a security boundary.** Uploaded workspace app packages are
untrusted code running in a sandboxed iframe. Never widen the method allowlist
in `handleAppRequest` (`lib/platform/appBridge.js`) and never bypass its
capability checks to make an app work. Host state reaches apps only through
capability-filtered `workspace` responses.

**Two persistence layers, not one.** `lib/storage/workspaceStore.js` holds the
single current workspace snapshot; `lib/dataStore.js` holds per-dataset caches.
Do not conflate them.

**Chatbot district selection is deterministic.** The AI must never choose which
districts get highlighted or selected — resolve those from real data and
anaphora.

### API route checklist

When adding an endpoint:

- Wrap the handler in `withRateLimit` from `lib/rateLimit.js`
- Validate inputs with `lib/validation/apiValidation.js`
- Use context builders from `lib/aiContextBuilders.js` for AI prompts
- Cache deterministic AI responses with `lib/ai/aiCache.js`
- Use `APP_BASE_URL` for internal API-to-API calls — never hardcode `localhost`
- Return **generic** error messages; never expose `error.message` to clients

### Adding an app capability or bridge method

Update all four, or the change is incomplete:

1. `lib/platform/appManifest.js` (`CAPABILITIES`)
2. `lib/platform/appBridge.js` (explicit allowlist + capability check)
3. The `accessLabels` map in `components/platform/AppHub.js`
4. `tests/appManifest.test.js` / `tests/appPackages.test.js`

---

## Tests

New domain logic in `lib/` should come with a unit test. New app-platform
behaviour should extend the `appManifest` / `appPackages` / `appStore` tests.

Run `npm test` before opening a PR.

---

## Pull requests

- Branch from `main`
- Keep the PR focused on one change
- Describe **what changed and why** — the operational reasoning matters
- Note any new environment variable, dependency, or migration
- Include the CLA agreement line (see above)
- Make sure `npm test` and `npm run build` pass

---

## Reporting security issues

**Do not open a public issue for a security vulnerability.**

Email **johnm.esplana@gmail.com** with the details and, if you have one, a
suggested fix. You will get an acknowledgement, and credit in the fix unless you
prefer otherwise.

---

## Questions

Open a GitHub issue, or email **johnm.esplana@gmail.com**.
