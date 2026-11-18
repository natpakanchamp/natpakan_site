# Security Policy

## Supported Versions

This is a personal portfolio and static site. Only the latest deployed version is actively maintained.

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |
| older   | :x:                |

## Scope

This site is built with [Astro](https://astro.build) and deployed on Cloudflare Pages. It uses Firebase (server-side only, via a service account) for view counters and rate limiting. Public pages are static; the only authenticated surface is the owner's admin at `/admin/` and `/api/admin/*`, protected by Cloudflare Access with the Access JWT re-verified on every request.

**In scope:**
- Cross-site scripting (XSS) vulnerabilities
- Content injection or defacement
- Exposed API keys or credentials in the source code
- Third-party dependency vulnerabilities with a realistic exploit path
- Firebase security rules that allow unauthorized reads/writes
- Any way to reach `/admin/` or `/api/admin/*` without being the configured admin

**Out of scope:**
- Denial-of-service attacks
- Issues in Cloudflare or Firebase infrastructure (report those directly to the respective vendors)
- Vulnerabilities requiring physical access to my machine

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not open a public GitHub issue**.

Instead, report it privately via email:

**champnatpakan@gmail.com**

Please include:
- A clear description of the vulnerability
- Steps to reproduce or a proof-of-concept
- The potential impact

I will acknowledge your report within **3 business days** and aim to resolve confirmed issues within **14 days**. I'll keep you updated on the progress and credit you in the fix if you'd like.

Thank you for helping keep this project secure.
