# Installable browser apps

In Workspace apps, click **Add app**, choose a ZIP, review its details and access,
then click **Confirm installation**. Click **Open** on its card. Use **Download
example app** to try the included activity planner. Installation requires no
platform rebuild and is local to the current browser, origin and workspace.

## Build your own

Copy this template, change manifest.json (especially the stable unique ID), and
edit index.html. Build with:

```
node scripts/build-installable-app.mjs templates/installable-app public/apps/activity-planner.zip
```

Pass your own directory and output ZIP path to build another app. This command
replaces the output file. The ZIP must contain exactly manifest.json and index.html
at the root. It is limited to 5 MB compressed and 5 MB HTML unpacked. The manifest
must declare runtime "iframe-v1" and platformApiVersion 1.

All JavaScript and CSS must be inline; images can use data URLs. React or another
framework can be used if its production build is bundled into this single HTML.
No CDN, external modules, separate assets or server code are supported. These are
Aidstack packages, not DHIS2-compatible ZIPs. The earlier workspace-app template
and app:validate source archives are for bundled developer contributions only.

## Runtime API

The host injects window.aidstack before your code runs. Methods return promises:

- aidstack.getWorkspace(): workspaceId and permitted districts/facilities arrays.
- aidstack.storage.listPlans(): summaries for this module and workspace.
- aidstack.storage.loadPlan(id): plan or undefined.
- aidstack.storage.savePlan(plan, expectedRevision = 0): saved plan with revision.
- aidstack.setDirty(boolean): controls the host's unsaved-changes prompt.

read:boundaries and read:sites grant the respective workspace arrays. write:plans
grants storage methods. Records require id and metadata.name. Use the saved
revision on updates. A record is limited to 2 MB through this bridge. Domain
validation and record schema migrations belong to your app. export:plans is
metadata only in this runtime; there is no export bridge yet.

Apps run in a sandboxed iframe without same-origin access, popups, top navigation
or downloads. Form handlers can run, but CSP blocks native form submissions,
external resource requests and nested frames.
Host operations are explicitly allowlisted and bound to module/workspace scope.
This is not a malware scanner or a CPU/memory quota: only install apps you trust
with the data access you grant. Authors and versions are self-declared.

Upload the same ID again to replace code after reviewing the replacement notice.
Plans survive updates and disabling. Keep IDs stable and migrate your own schemas.
Clearing browser site data removes installed packages and plans. Installations do
not sync across devices; no public marketplace or organization publishing service
is involved. You can distribute the built ZIP directly to another user to install.

## Isolation and module cooperation

A ZIP module is an isolated browser application, not a Docker container. It can
supply its own interface and calculations without rebuilding Atlas. Server-side
Python, services and background jobs require a separately deployed backend and
are not executed from uploaded ZIP files.

Modules read approved workspace data through the bridge and keep private plans
in their own module namespace. Running one module does not execute another module
or expose its storage. Bundled Access Gaps and Immunization modules can exchange
explicitly published result snapshots through a trusted host API. That API is not
yet available to contributed ZIP modules; it requires a separately defined
permission and result contract.
