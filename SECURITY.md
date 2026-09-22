# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Email **johnm.esplana@gmail.com** with:

- a description of the vulnerability and its impact
- steps to reproduce it
- affected version or commit
- a suggested fix, if you have one

You will receive an acknowledgement. Please allow a reasonable window for a fix
before public disclosure. Reporters are credited in the fix unless they prefer
otherwise.

## Scope

Aidstack Atlas handles operational data for humanitarian and public-health
response — facility locations, boundaries, and analysis of exposed populations.
Issues that are especially relevant:

- sandbox escape from an uploaded workspace app package
  (`lib/platform/appBridge.js`, `components/platform/InstalledAppFrame.js`)
- capability-filter bypass exposing workspace data to an app that did not
  declare the capability
- server-side request forgery or key leakage via API routes
- injection through uploaded CSV, GeoJSON, shapefile, or document parsing
- exposure of `OPENAI_API_KEY` or `GEE_SERVICE_ACCOUNT_KEY` to clients

## Operators: your responsibilities

If you self-host Atlas, you are the data controller for anything your users
upload. Set your own API keys, keep `.env.local` out of version control, put
rate limiting (`REDIS_URL`) in front of AI endpoints in production, and review
the AGPL section 13 source-offer obligation in [NOTICE](NOTICE).
