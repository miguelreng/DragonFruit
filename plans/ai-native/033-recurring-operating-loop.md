# Plan 033 / PRD: The Recurring Operating Loop

> **Bet:** DragonFruit earns retention by carrying work from messy input through approval, follow-through, and reporting—not by producing one more AI response.  
> **Portfolio:** AI-native product strategy  
> **Status:** Proposed; concierge validation must precede full implementation  
> **Priority:** P1  
> **Effort:** L, approximately 6–10 engineering weeks after validation  
> **Risk:** High — recurring automation can create noise, duplicate work, or unsafe changes at scale  
> **Depends on:** Plan 032; Plan 031 for external-origin entry points; existing AgentRun approval lifecycle  
> **Planned at:** commit `d2ca9cd196`, 2026-07-30

## Product decision

The first opinionated DragonFruit workflow will be a weekly operating loop for small teams:

1. collect loose inputs;
2. draft the week’s plan;
3. ask for approval;
4. create or update the accepted work;
5. follow up on blockers and missing decisions;
6. produce a Friday progress report;
7. carry unresolved context into the next week.

The loop is not a generic no-code automation builder. It is a productized outcome with clear inputs, states, permissions, and recovery.

The public promise is:

> **Bring the mess. Keep the meaning. Move the work.**

## Problem

AI tools are good at generating a plan from a prompt. The plan often becomes another document the user must manually translate into Tasks, track, revisit, and reconcile.

DragonFruit already has pieces of a recurring loop:

- Tasks, Docs, Sheets, Stickies, meeting/calendar context, and imports;
- Atlas task/page/chat tools;
- `AgentAutomation` with an `issue_created` trigger and conditions;
- `AgentRun` statuses, cost/tool telemetry, cancellation, and `needs_input`;
- approval pause/resume;
- actionable-run inbox and notifications;
- Project and Workspace Brief context;
- Celery workers and scheduled infrastructure.

But these pieces do not yet form a coherent outcome:

- automations react only to a narrow event;
- there is no scheduled workflow definition or workspace timezone behavior;
- one AgentRun does not represent a multi-stage business process;
- there is no batch proposal for Tasks/Docs with partial approval;
- there is no durable link between an input set, approved plan, created work, follow-ups, and final report;
- retries can create duplicates without workflow-level idempotency;
- users cannot see what will happen before enabling a recurring loop;
- success is measured as model/run completion, not work completion.

## User and job story

**Primary user:** a founder or small-team operator who spends the beginning and end of each week converting scattered information into plans and status updates.

> When ideas, meeting notes, unfinished Tasks, and new requests accumulate, I want DragonFruit to prepare the next coherent plan, ask for my judgment, and follow the accepted work through the week, so coordination happens without becoming my full-time job.

## Desired outcome

For a 10-workspace, four-week design-partner cohort:

- 6 use the loop in at least three of four weeks;
- 5 demonstrate willingness to pay;
- 70% of generated weekly plans receive at least one accepted proposal;
- 80% of accepted actions are created exactly once;
- fewer than 10% of notifications are dismissed as irrelevant/noisy;
- users report meaningful time saved in planning or reporting;
- at least 3 workflows per retained workspace reach successful completion each week.

## Validation before build

Run the complete loop as a concierge service before implementing an orchestration engine.

### Cohort

- 10 AI-forward teams, ideally 2–15 people;
- one real active project per team;
- four consecutive weeks;
- founder/ops champion available for a weekly 15-minute review.

### Manual service

- collect their current inputs using existing DragonFruit surfaces;
- use Atlas plus human correction to draft the plan;
- present a structured approval package;
- create accepted Tasks/Docs manually if needed;
- perform one midweek blocker check;
- deliver a Friday report;
- record every manual intervention and failure.

### Exit gate

Proceed to full build only if:

- at least 6 teams repeat the loop;
- at least 5 will pay or sign a clear paid-pilot commitment;
- one common input/output shape covers at least 70% of cases;
- the value is follow-through/context continuity, not only quality of generated prose.

If the gate fails, revise the workflow rather than building a more generic automation platform.

## V1 experience

### Setup

The user chooses:

- workspace and project scope;
- planning day/time and timezone;
- included input sources;
- default reviewer(s);
- what Atlas may do automatically;
- what always requires approval;
- midweek and report timing;
- notification channels available in the product.

Show a plain-language preview:

> “Every Monday at 8:00, Atlas will review the Project Brief, unfinished Tasks, selected Docs, and new captured items. He will draft a weekly plan. Nothing will change until you approve it.”

### Input set

V1 inputs:

- Workspace and Project Brief;
- incomplete/recently changed Tasks;
- selected project Docs;
- Stickies converted or explicitly included;
- meeting notes/calendar items already present in DragonFruit;
- manually added text or links;
- approved external-origin captures from Plan 031.

Every input has scope, source, captured timestamp, and inclusion reason. Permission filtering happens before prompt construction.

### Plan proposal

The weekly proposal contains:

- short outcome summary;
- priorities;
- proposed new Tasks;
- proposed Task updates;
- proposed Docs or Doc changes;
- blockers/questions;
- deferred items with rationale;
- sources used;
- estimated action count.

Users may:

- accept all safe proposals;
- select individual proposals;
- edit before accepting;
- reject with optional feedback;
- postpone;
- ask Atlas to revise.

No Task or Doc changes occur before the required approval.

### Active week

After approval:

- accepted actions execute idempotently;
- the plan links to created/updated objects;
- Atlas asks only for decisions that block material progress;
- a midweek check summarizes drift, blockers, and missing ownership;
- the user may pause the loop at any time.

### Friday report

The report shows:

- planned vs completed;
- decisions made;
- blockers and unresolved work;
- context changes proposed/accepted;
- work carried forward;
- links to evidence.

The report is stored as a normal Doc or a typed, exportable workflow artifact that can become a Doc. It must remain useful without an AI model.

## Conceptual model

### Workflow definition

An opinionated recurring process configured for a workspace/project.

Fields:

- workspace;
- optional project;
- name and workflow type (`weekly_operating_loop`);
- schedule, timezone, and next run;
- input-source configuration;
- reviewer configuration;
- action policy;
- status (`draft`, `active`, `paused`, `archived`);
- created/updated by;
- timestamps.

### Workflow run

One execution of a definition for a bounded period.

States:

- `scheduled`
- `collecting`
- `drafting`
- `needs_input`
- `needs_approval`
- `approved`
- `executing`
- `active`
- `reporting`
- `completed`
- `failed`
- `cancelled`

Fields:

- definition;
- period start/end and idempotency key;
- trigger origin;
- context snapshot;
- input manifest;
- proposal package;
- reviewer and decision timestamps;
- execution summary;
- report reference;
- linked AgentRuns;
- cost/usage;
- error and recovery state;
- timestamps.

### Workflow proposal

A typed proposed action:

- create/update Task;
- add Task comment;
- create Doc;
- propose Doc update;
- request decision;
- defer item;
- suggest context change.

States:

- `proposed`
- `edited`
- `accepted`
- `rejected`
- `executing`
- `completed`
- `failed`
- `superseded`

Each proposal includes:

- validated arguments;
- target object when applicable;
- source references;
- risk class;
- required approval policy;
- stable idempotency key;
- result reference.

## Scheduling semantics

- Store schedule timezone explicitly using an IANA zone.
- Calculate and persist `next_run_at` in UTC.
- Define daylight-saving behavior and test skipped/repeated local times.
- At most one run per definition/period.
- A missed schedule inside a bounded grace window runs once; outside it, mark skipped and notify.
- Pausing prevents new runs but does not silently cancel an executing run.
- Editing a definition affects future runs, not the immutable input/proposal snapshot of a run already started.
- Deleting a definition archives it; run history remains.

## Approval and action policy

Reuse the trust model established by Atlas:

- reads and drafting are automatic;
- proposals are visible before mutation;
- each action carries a risk class;
- workspace policy determines which low-risk actions may be batch-approved;
- risky actions always require explicit approval;
- partial approval is first-class;
- approval expires after a configured period;
- changing proposal arguments after approval invalidates the approval;
- declined actions cannot be retried silently.

The workflow approval package may group actions, but each action retains its own result and audit record.

## Execution requirements

### Idempotency

Use deterministic keys:

- workflow run: definition + period;
- proposal: workflow run + stable proposal id;
- resulting object mutation: proposal id + operation version.

Retries must return or reconcile the original result. A timeout after a successful write must not create a second Task, Doc, comment, or report.

### Concurrency

- lock one workflow period at collection/start;
- prevent overlapping runs unless explicitly supported later;
- serialize conflicting proposals for the same object;
- detect if a human changed a target after proposal creation;
- require rebase/review rather than overwriting newer human work.

### Recovery

- retry transient model/network/queue failures with bounded backoff;
- do not automatically retry validation, permission, or rejected-approval failures;
- allow retry of only failed accepted proposals;
- show partial success clearly;
- preserve the proposal package and source manifest after failure;
- provide a global and per-workflow pause/kill switch.

## API requirements

Definitions:

- list/create/get/update/pause/resume/archive;
- preview the next run and input scope;
- test-run without writes.

Runs:

- list/get;
- start manually;
- cancel;
- submit missing input;
- approve/edit/reject proposals;
- retry failed accepted proposals;
- retrieve report and context/source inspector.

All endpoints enforce normal workspace/project permissions and reviewer authority. Test-run uses the same collection and drafting code but cannot mutate workspace objects.

## Product surfaces

### Workspace/Project Workflows

- weekly loop setup;
- status and next run;
- plain-language action policy;
- recent runs;
- pause;
- test preview.

### Home

- next weekly plan;
- pending approval;
- active blockers;
- most recent report.

### Atlas inbox

Reuse `needs_input` and approval interaction where possible. A workflow-run card groups related proposals while preserving individual decisions.

### External surfaces

Plan 031 may:

- trigger an authorized manual run;
- fetch run status;
- list/respond to pending approval when scoped;
- retrieve the final report.

An external client cannot edit a workflow definition unless a separate future administrative scope is granted.

## Notifications

V1 notification reasons:

- plan ready for review;
- blocking question;
- approved actions partially failed;
- midweek blockers;
- Friday report ready;
- workflow paused or authorization lost.

Digest related events. Do not notify separately for every generated Task.

Measure notification relevance through open/action/dismiss behavior and direct design-partner feedback.

## Telemetry

Capture:

- `workflow_definition_created`
- `workflow_enabled`
- `workflow_run_started`
- `workflow_plan_ready`
- `workflow_proposal_accepted`
- `workflow_proposal_rejected`
- `workflow_execution_completed`
- `workflow_execution_partial`
- `workflow_blocker_requested`
- `workflow_report_completed`
- `workflow_paused`
- `workflow_run_failed`

Primary metrics:

- successful delegated workflows per active workspace/week;
- weekly-loop week-4 retention;
- proposal acceptance rate;
- accepted-action completion rate;
- duplicate-action rate;
- time from plan ready to approval;
- manual intervention rate;
- notification dismissal rate;
- paid conversion and churn for workflow-enabled workspaces.

Do not send source content, plan text, Task/Doc bodies, or proposal arguments to third-party analytics.

## Acceptance criteria

- [ ] A user can configure, preview, activate, pause, resume, and archive a weekly loop.
- [ ] The schedule respects the selected timezone and creates at most one run per period.
- [ ] Every run has an immutable input manifest and context snapshot.
- [ ] The user sees proposed actions before required writes.
- [ ] Users can edit, partially accept, reject, or request revision.
- [ ] Editing an approved action invalidates prior approval.
- [ ] Accepted actions execute exactly once across retries.
- [ ] Concurrent human changes are detected and never silently overwritten.
- [ ] Partial failures preserve successful results and allow targeted retry.
- [ ] Midweek check and Friday report link to evidence.
- [ ] Pausing stops future runs; cancellation safely stops the current run between actions.
- [ ] Role, scope, and project permissions apply to collection, review, execution, and reporting.
- [ ] Workflow history remains useful and inspectable if the model provider changes.
- [ ] External-origin triggers obey the same policy and attribution.
- [ ] Telemetry can calculate the North Star without capturing customer content.

## Implementation plan

### Phase 0 — concierge validation

Run the four-week cohort described above. Store a structured research log outside production data with:

- input sources used;
- corrections required;
- proposal types;
- approval behavior;
- duplicate/conflict cases;
- time saved;
- willingness to pay;
- manual interventions.

Exit only through the defined gate.

### Phase 1 — workflow domain and deterministic preview

- Add workflow definition, run, and proposal models.
- Add state transition services with explicit allowed transitions.
- Add schedule/timezone/idempotency helpers.
- Build a read-only test preview from real permission-filtered inputs.
- Link Plan 032 context snapshots.
- Add model-independent fixtures and state-machine tests.

Expected API areas:

- `apps/api/plane/db/models/agent.py` or an isolated workflow model module;
- new migrations;
- `apps/api/plane/app/views/agent/` workflow endpoints;
- `apps/api/plane/bgtasks/` collection/drafting/orchestration tasks;
- focused unit and contract tests.

STOP if the design requires one unbounded Celery task to remain alive for the entire week. Persist state and schedule short, idempotent steps.

### Phase 2 — setup and preview UI

- Build Workflows settings at workspace/project scope.
- Add schedule, sources, reviewers, policies, and notification setup.
- Show next-run preview and explain all effects.
- Provide a write-disabled test run.
- Add accessibility, empty, loading, failure, and permission states.

### Phase 3 — proposal and batch approval

- Produce typed proposals with stable ids and validated arguments.
- Build grouped review with select/edit/accept/reject/revise.
- Reuse existing approval language and notifications.
- Invalidate approval on edits.
- Add source/evidence inspection.

### Phase 4 — idempotent execution

- Implement one executor per proposal type using shared domain services.
- Add concurrency checks and optimistic version/precondition data.
- Store result object references.
- Support partial completion and targeted retry.
- Keep destructive actions out of V1.

### Phase 5 — midweek and report

- Schedule the midweek check and final report as separate persisted steps.
- Compare the approved plan to current objects and activity.
- Generate a linked report with evidence and carry-forward proposals.
- Feed accepted context changes through Plan 032.

### Phase 6 — external parity and packaging

- Add Plan 031 tools for trigger/status/approval/report.
- Gate workflow capacity through the validated commercial package.
- Add spend/run caps and clear usage visibility.
- Run the paid beta before general availability.

## Verification

Minimum:

- state-machine transition tests;
- schedule/timezone/DST/missed-run tests;
- unique period and idempotency concurrency tests;
- permission-filtered input collection tests;
- proposal validation and approval invalidation tests;
- human-change conflict tests;
- partial failure and targeted retry tests;
- cancellation/pause tests;
- notification dedupe tests;
- report evidence tests;
- full API tests;
- web unit tests, types, and accessibility smoke;
- end-to-end four-week accelerated simulation using clock controls.

Repository commands:

- `pnpm test:api`
- `pnpm --filter=web test:unit`
- `pnpm --filter=web check:types`
- `pnpm check`

## Rollout

1. Concierge cohort with manual execution.
2. Internal read-only preview.
3. Five-workspace allowlisted beta with approval required for every write.
4. Paid design-partner beta with limited workflow count.
5. Expand low-risk policy options only after duplicate, conflict, and notification metrics are healthy.
6. General availability with kill switches and run caps.

## Risks and mitigations

| Risk                                           | Mitigation                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| The weekly loop is not a frequent paid need    | Concierge payment gate before build                                    |
| Duplicate Tasks/Docs on retry                  | Workflow/proposal/action idempotency and result reconciliation         |
| Automation noise                               | Opinionated scope, digest notifications, relevance metrics, easy pause |
| Wrong plan creates busywork                    | Proposal review, partial acceptance, source visibility, revision       |
| Human edits are overwritten                    | Version/precondition checks and re-review                              |
| Long-running workflow is operationally fragile | Persisted state machine and short idempotent jobs                      |
| Model cost surprises                           | Per-run cost visibility, limits, BYOK, managed-usage caps              |
| Generic automation-builder scope explosion     | One fixed weekly workflow type in V1                                   |
