# NexusFlow Workspace Design QA

- source visual truth: `/Users/daemon1/.codex/generated_images/019fd028-9c45-7253-b5d4-a739a9ebbfff/exec-75a1de19-5763-4691-935e-1ca59fa45394.png`
- implementation screenshot: `/Users/daemon1/nexusflow/docs/design/workspace-projects-editable-2026-08-05.png`
- source pixels: `1487 × 1058`
- implementation pixels: `1470 × 801`
- CSS viewport: `1470 × 801`
- device pixel ratio: `2`; Chrome screenshot output is normalized to CSS pixel dimensions by the browser integration
- state: light theme, authenticated workspace owner, `生产 API` selected, ¥50,000 monthly budget, owner member and one service account bound to the project
- local route: `http://127.0.0.1:3002/enterprise?section=projects`

## Full-view comparison evidence

The source and implementation were opened together in the same comparison tool input for both iterations. The source is taller than the available user Chrome viewport, so the comparison uses the same desktop-width composition while treating content below 801 CSS px as a viewport difference, not a fidelity failure.

The final implementation matches the source's primary composition: 205–230 px workspace navigation, compact page header with search and primary action, project master-detail split, budget band, identity table, policy section, quiet white surfaces, thin neutral dividers, teal active state, compact Chinese UI typography, and restrained radii/shadows.

## Focused region comparison evidence

The project header, budget band, identity section, and model policy region were readable in the full-resolution comparison and did not require a separate crop. The second browser capture also verified two real identity types in the table: member and service account.

## Required fidelity surfaces

- Fonts and typography: system Chinese sans stack, compact UI sizes, weight hierarchy and truncation match the target closely. The implementation preserves the existing NexusFlow font system.
- Spacing and layout rhythm: header, master-detail tracks, section dividers, row density and action alignment now match the target. The shorter browser viewport naturally shows less of recent activity.
- Colors and visual tokens: white/neutral surfaces, teal selection/actions, soft teal identity badges and low-contrast borders match the source and existing product tokens.
- Image and asset fidelity: the target contains no photographic assets. All UI icons use the existing product icons or `@ant-design/icons`; no handcrafted SVG, emoji, CSS illustration or placeholder asset was introduced.
- Copy and content: labels follow the selected concept (`项目与成本中心`, `身份与密钥`, `模型与限流策略`). Usage remains explicitly unknown until `project_id` attribution exists; no synthetic spend or traffic is presented as real.

## Findings and comparison history

### Iteration 1 — blocked

- [P1] Identity area used cards instead of the target's dense member/service-account table.
  - Fix: replaced cards with a five-column identity table and distinct member/service-account treatments.
- [P2] Success notice occupied a full-width row and pushed core content below the fold.
  - Fix: converted notices to a non-blocking bottom-right toast.
- [P2] Search and primary action were on a separate toolbar row and the page title was too generic.
  - Fix: aligned search/action with the page header and renamed the page `项目与成本中心`.
- [P0] Sidebar query navigation changed the URL without updating the selected workspace section.
  - Fix: workspace sidebar links now perform a reliable route navigation; Chrome re-test reached `成员与身份` and rendered the correct section.

### Iteration 2 — visually passed, interaction gap found

- Post-fix evidence shows the intended project/cost-center hierarchy, compact header, master-detail layout, tabular identities and policy region.
- Remaining differences are expected data/state differences: one project rather than three, unknown current spend rather than fabricated spend, and the shorter available Chrome viewport.
- [P1] The visual hierarchy matched, but project identities and service accounts were still effectively read-only in the core management journey.
  - Fix: added project editing, project-role editing/removal, workspace member role/status/removal, and service-account configuration/reset/suspend/delete drawers.
- [P1] Entering a service-account username such as `prod-api-bot` could be mistaken for the email-password flow and trigger native `@` validation.
  - Fix: renamed the login choices to `邮箱密码` and `服务账号`, and made the service-account username field explicitly `type="text"`.

### Iteration 3 — passed

- The latest comparison preserves the same visual composition while adding a compact operation column and management drawers rather than disturbing the table hierarchy.
- Remaining differences are expected data/state differences: one project rather than three, unknown current spend rather than fabricated spend, and the shorter available Chrome viewport.
- No actionable P0/P1/P2 visual or core-interaction finding remains. A P3 future refinement is to show a workspace switcher inside the sidebar when one user belongs to multiple organizations.

## Primary interactions tested

- phone OTP login in local test mode
- create workspace
- create production project with monthly budget
- navigate between project and member/identity sections
- create service account and verify one-time credential state
- bind service account to project and verify principal count/activity update
- project policy drawer opens and exposes budget/model/region/SLA/RPM/TPM controls
- save project description and RPM/TPM limits, then verify the values in the detail view
- edit a service account's project role from developer to viewer and back through the real PATCH endpoint
- open service-account management, save monthly quota and model allow-list, and verify the updated row
- verify the service-account username control is `type=text` and accepts `prod-api-bot` without native email validation
- verify explicit login tabs for `邮箱密码` and `服务账号`

## Console and runtime checks

- The initial compatibility crash from an older backend response shape was fixed with defensive response defaults and a clean backend restart.
- A stale nodemon child was found still serving the previous route table during editability QA; the local backend was cleanly restarted and all management interactions were repeated against the current source.
- No new NexusFlow page error occurred during the post-fix end-to-end interaction run. Remaining Chrome log noise is from installed wallet/password-manager extensions.
- Frontend and backend production builds pass; enterprise/phone-auth integration tests pass.

## Final result

final result: passed
