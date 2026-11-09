# Immunization planning

First-party module for coverage analysis, session planning and resource estimates.
Entry point: index.js. Metadata: manifest.json.

This module currently uses platform-provided helpers in lib/planning, its import
worker in workers, and shared styles in components/platform. Its source archive
therefore targets this platform repository; it is not a standalone application.

Validate with `npm run app:validate -- components/apps/immunization`.

The Access tab can explicitly attach an Access Gaps publication from this
workspace. A copy is saved with the plan and exported with the workbook/JSON
backup. Matching uses exact settlement and administrative-area IDs; coordinate
changes are flagged. The access population never replaces eligible children,
vaccinated counts or session allocations. New publications do not automatically
update attached evidence. See `../access-gaps/README.md` for input and method details.
