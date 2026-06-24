# Security Policy

## Supported Versions

This is a personal portfolio and static site. Only the latest deployed version is actively maintained.

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |
| older   | :x:                |

## Scope

This site is built with [Astro](https://astro.build) and deployed on Netlify. It uses Firebase for view counters. As a static site with no user authentication or sensitive data collection, the attack surface is limited.

**In scope:**
- Cross-site scripting (XSS) vulnerabilities
- Content injection or defacement
- Exposed API keys or credentials in the source code
- Third-party dependency vulnerabilities with a realistic exploit path
- Firebase security rules that allow unauthorized reads/writes

**Out of scope:**
- Denial-of-service attacks
- Issues in Netlify or Firebase infrastructure (report those directly to the respective vendors)
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
