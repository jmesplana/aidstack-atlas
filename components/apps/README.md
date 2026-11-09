# Contributing workspace apps

For **uploadable apps that install without a platform rebuild**, use
`templates/installable-app/README.md`. Workspace apps now provides Add app and
a downloadable example ZIP. The instructions below describe the separate
bundled source-module workflow.

Workspace apps are reviewed React modules with a manifest.json, index.js default
component export, and README.md. The store currently enables bundled modules in
each browser workspace. Packages are source contributions, not remotely loaded
executables. No publishing service or server database is required for this stage.

## Create and register

1. Copy templates/workspace-app to components/apps/your-app-id.
2. Set a unique manifest id, name, description, author, major.minor.patch version,
   platformApiVersion (currently 1), requiredData and capabilities.
3. Import your manifest in lib/platform/appRegistry.js and add it to defineAppRegistry.
4. Add its ID and literal dynamic import in components/platform/appComponents.js.
   Follow immunization's example. No changes to AppHub are needed.
5. Run `npm run app:validate -- components/apps/your-app-id`, `npm test`, and
   `npm run build`. Test installation, opening, saving, reopening, disabling and
   workspace isolation in the browser.

## Host API

The host passes workspaceId and a leaveGuard ref. Apps with read:boundaries get
districts, and apps with read:sites get facilities; otherwise these are empty
arrays. write:plans provides storage. export:plans declares export behavior.
Required data accepts administrative-boundaries and facilities. Missing data
blocks installation/opening but never prevents disabling an installed app.

Set leaveGuard.current to a synchronous function returning whether navigation
may proceed, and clear it on unmount. Apps with unsaved data should also handle
beforeunload. The host remounts apps on workspace changes and catches render errors.

## Explicit shared results (bundled apps)

Reviewed bundled apps can receive `sharedResults` from the host's
`createWorkspaceResults` policy. Access Gaps can publish a saved assessment;
Immunization Planning can list/load published snapshots and explicitly attach a
copy to its own plan. No module reads or writes another module's private state.
The host binds the workspace and publisher identity. Publication captures a
saved revision and carries source dates, geometry versions, assumptions and
limitations. New publications do not mutate attached snapshots. Withdrawal
prevents new attachments and retains evidence already saved in other plans.

This API is not available to uploaded iframe apps. Its internal storage namespace
starts with `@`, which is prohibited in manifest IDs. Extend trusted publisher /
reader policy deliberately when adding another supported bundled module; do not
widen the iframe bridge to reuse this API. `selectedDistricts` is passed only to
bundled modules declaring boundary access, and `onShowResult` displays a published
snapshot on the host map.

These declarations govern host props; they are not a security boundary. Bundled
modules execute trusted JavaScript on the platform origin. Uploaded apps instead use the isolated browser runtime and enforced bridge
described in `templates/installable-app/README.md`. Module dependencies and
backend extensions are not supported by ZIP packages.

## Storage

Use await storage.listPlans(), storage.loadPlan(id), and
storage.savePlan(plan, expectedRevision = 0). A record needs a non-empty string id
and metadata.name string. Storage supplies moduleId, workspaceId, revision and
savedAt. Pass the saved revision on updates. Conflicting revisions or scope fields
reject. Missing records return undefined. Domain validation belongs to the app.

Records, summaries and revision history are saved atomically. IDs are independent
between modules and workspaces. Data stays in IndexedDB on this browser/origin.
Disabling retains records. Legacy immunization plans and history migrate on first
open; close older tabs if they block the database upgrade. Server storage can
later implement the same contract through createModuleStorage's adapter argument.

## Submit and release

Run `npm run app:validate -- components/apps/your-app-id --pack` to produce a ZIP
under build/app-packages. This validates metadata and required files, not code
correctness or security. Existing archives are not overwritten. Review archive
contents before sharing; never include secrets or operational data.

Submit a pull request with the source directory, registration changes, tests,
and documentation of platform helpers or additional dependencies used. A reviewer
checks the declared data access, data handling, compatibility, migrations and UI.
After review, the maintainer merges and deploys the platform release. The module
then appears in Workspace apps. This workflow does not publish automatically.

Keep module IDs stable across updates so saved records remain accessible. Version
your record schema separately and migrate older records in the module. Current
installations track enabled IDs; code versions follow the platform release.
Independent version selection, remote package installation and automatic rollback
are future runtime work, not features of this source package format.
