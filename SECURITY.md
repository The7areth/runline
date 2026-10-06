# Security and privacy

The personal deployment is owner-private. Public source includes fictional examples only, no screenshots, API keys, location tracks or database exports.

- All API routes require signed-in identity and owner-scoped access.
- Mutations reject mismatched origins.
- Public Strava reads allow only named HTTPS hosts and expected activity/share paths. Redirects, response size, timeout and network hops are bounded.
- Intervals.icu credentials are transient and read-only in the application workflow.
- OCR happens in the browser using locally hosted assets.
- Uploaded images remain private and are stored only after explicit save.

The platform must strip untrusted identity headers and inject verified identity. Do not expose the Worker origin directly or deploy the header adapter behind an untrusted proxy.

Known retention limitation: deleting a summary does not delete its attached images. Implement attachment lifecycle cleanup before offering account-wide deletion guarantees. No penetration test or production security certification is claimed.

Please report vulnerabilities privately to the repository owner. Do not post credentials, private running records or exploit data in public issues.
