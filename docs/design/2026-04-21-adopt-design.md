# Adopt Unmanaged Docker Compose Stacks

**Date:** 2026-04-21
**Status:** Approved

## Problem

Docker Compose stacks running on the host that were not deployed through labrador are invisible to it. Users want to bring these stacks under management without restarting containers.

## Adoptability Rule

A stack is adoptable if its `com.docker.compose.project` label value does not match any project's `slug` in the database for that user. This is the single source of truth — container labels are not used for this check.

Two concrete scenarios produce adoptable stacks:
1. **Never managed** — containers have no `labrador.project_id` label and the stack name isn't a known slug.
2. **Orphaned** — containers have a `labrador.project_id` label whose UUID no longer exists in the `projects` table.

After adoption the project record exists with `slug = stackName`, so the stack immediately falls out of the adoptable list. Container labels remain unchanged until the user redeploys through labrador.

## Backend

### AdoptService (`src/server/services/adopt.service.ts`)

**`listAdoptable(userId: string)`**
- Fetches all containers from Docker that have the `com.docker.compose.project` label.
- Groups containers by stack name. `workingDir` is read from the `com.docker.compose.project.working_dir` label on any container in the group.
- Queries all project slugs for the user from the DB.
- Returns stacks whose name is not in the slug set.
- Return shape: `{ stackName: string, workingDir: string, containerCount: number }[]`

**`adoptStacks(stackNames: string[], userId: string)`**
- Re-queries Docker to build a map of `stackName → { workingDir, containerIds[] }` for the requested names.
- Checks the DB for existing slugs; any `stackName` that already matches a slug is immediately added to `failed` with reason `"slug already exists"`.
- For each remaining stack, resolves `composeContent`:
  - Tries to read `docker-compose.yml` then `compose.yml` from `workingDir` on disk.
  - If found: use file content as-is.
  - If not found: inspect each container via Dockerode, generate commented YAML from image, ports, env, volumes, and networks. Prepend `# ⚠️ Original compose file not found at <workingDir>. Generated from running containers — review and uncomment before deploying.` The generated YAML block is fully commented out (`# ` prefix on every line). If the slug matches an existing template, use that instead.
- Creates a project record per stack:
  - `name = stackName`
  - `slug = stackName`
  - `composeContent` from above
  - `status = 'running'`
  - `deployedAt = Date.now()`
- Returns `{ adopted: string[], failed: { stackName: string, reason: string }[] }`

### Routes (added to `projectRoutes`)

- `GET /api/projects/adoptable` — calls `adoptService.listAdoptable(userId)`, returns the array.
- `POST /api/projects/adopt` — body: `{ stackNames: string[] }`, calls `adoptService.adoptStacks(stackNames, userId)`, returns `{ adopted, failed }`.

Both routes are protected by the existing `authenticate` preHandler.

## Frontend

### Shared hook

`useAdoptable()` — TanStack Query, key `['projects', 'adoptable']`, calls `GET /api/projects/adoptable`. Refetches on window focus disabled (consistent with other hooks).

### Shared component: `AdoptStacksDialog`

- Multi-select checklist of adoptable stacks (stack name + container count).
- All stacks selected by default.
- "Adopt selected" button — disabled when nothing selected.
- Calls `POST /api/projects/adopt` with selected stack names.
- On success: invalidates `['projects']` and `['projects', 'adoptable']`, shows success toast, closes dialog.
- On partial failure: shows warning toast listing failed stack names with reasons.
- Rendered as a native `<dialog>` element (consistent with existing modals).

### Shared component: `AdoptableStacksList`

Checklist sub-component used by both surfaces — renders the multi-select list and "Adopt selected" button. `AdoptStacksDialog` wraps it in a native `<dialog>`; the zero-state dashboard renders it directly inline.

### Surface 1 — Zero-state dashboard

Shown when `projects.length === 0` and `adoptable.length > 0`. Renders `AdoptableStacksList` inline above the "create your first project" CTA.

### Surface 2 — New project page (`ProjectEditor.tsx` in create mode)

Banner rendered near the top: "X existing stack(s) can be adopted." with an "Adopt" button. Clicking opens `AdoptStacksDialog` as a modal dialog. Banner is hidden when `adoptable.length === 0`.

## Data Flow

```
GET /api/projects/adoptable
  └── AdoptService.listAdoptable(userId)
        ├── Docker: listContainers({ label: 'com.docker.compose.project' })
        ├── DB: SELECT slug FROM projects WHERE userId = ?
        └── diff → adoptable stacks

POST /api/projects/adopt { stackNames }
  └── AdoptService.adoptStacks(stackNames, userId)
        ├── for each stack:
        │     ├── read compose file from workingDir (disk)
        │     │     └── fallback: inspect containers → generate commented YAML
        │     └── DB: INSERT project (name, slug, composeContent, status=running, deployedAt)
        └── return { adopted, failed }
```

## Testing

Unit tests for `AdoptService` (`src/server/services/__tests__/adopt.service.test.ts`) using vitest with `vi.stubGlobal` / mocked Dockerode and DB:

**`listAdoptable`**
- Returns stack that has no `labrador.project_id` label and no matching slug.
- Excludes stack whose name matches an existing project slug (never-managed but already adopted).
- Returns orphaned stack (has `labrador.project_id` label whose UUID is absent from the DB).
- Excludes stack that is fully managed (has label and matching project record).
- Returns empty array when all running stacks are known slugs.

**`adoptStacks`**
- Creates project record with compose content read from disk when file exists.
- Creates project record with commented generated YAML when compose file not found on disk.
- Generated YAML header comment includes the original `workingDir` path.
- Adds to `failed` with reason `"slug already exists"` when stack name collides with existing slug.
- Handles mixed batch: some succeed, some fail — returns correct `adopted` and `failed` arrays.
- Sets `status = 'running'` and `deployedAt` on created project.

## E2E Tests (`e2e/adopt.spec.ts`)

Uses the existing Playwright + `MockDockerService` pattern (reset via `POST /api/test/reset`, session via `GET /api/test/session`, mock docker state via `POST /api/test/mock/docker`). The mock needs a `listAdoptable` stub that reads from the containers array.

**Zero-state dashboard surface**
- When docker mock has compose stacks with no matching project slugs, the adoptable checklist appears on the dashboard.
- When docker mock has no unmanaged stacks, the checklist is absent.
- Selecting stacks and clicking "Adopt selected" creates project records and navigates to dashboard with projects visible.

**New project page banner**
- Banner shows correct count of adoptable stacks when they exist.
- Banner is hidden when no stacks are adoptable.
- Clicking the banner button opens the adopt dialog.
- Adopting from the dialog closes it and invalidates the project list.

**Adopt variations**
- Adopting an orphaned stack (has `labrador.project_id` label but no matching project) succeeds.
- Adopting a stack whose name collides with an existing slug shows a failure toast with the reason.
- Adopting a stack with a logo label (`labrador.logo_url`) restores the logo on the created project.
- Partial batch (some succeed, some fail) shows a warning toast listing failures alongside a success toast for adopted stacks.

## Logo Label

`deploy.service.ts` (`injectLabels`) must also inject `labrador.logo_url={project.logoUrl}` when `logoUrl` is set. This allows `AdoptService` to restore the logo when adopting an orphaned stack.

During adoption, `adoptStacks` reads the `labrador.logo_url` label from the stack's containers and sets it as `logoUrl` on the new project record. If the label is absent (never-managed stacks), `logoUrl` is left null.

## What Adoption Does Not Do

- Does not restart or recreate containers.
- Does not add `labrador.managed` or `labrador.project_id` labels to running containers. Labels are injected on next deploy.
- Does not configure exposure providers.
