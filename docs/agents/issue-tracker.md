# Issue tracker: Notion

Notion is the only issue tracker for this repository. Do not create local tickets, mirror their state in Markdown, or recreate `.scratch/`.

## Destination

- Tasks: [Project Manager / Tasks](https://app.notion.com/p/5cbf8094b13383d2a99c81499fbb90a7).
- Data source: `collection://c1ff8094-b133-82a4-8598-87887cec8c8b`.
- Project: [DMMarket](https://app.notion.com/p/3eff8094b133806fb32ced64a0ccef19).

Use the existing Tasks database and link every repository ticket to the DMMarket project. Do not create a new tracker or leave tickets as private workspace-level drafts.

## Conventions

Fetch the data source before writing to confirm current property names and allowed values. The current properties are:

- `Task Name`: concise, actionable title.
- `Project`: relation to DMMarket.
- `Status`: `Not started`, `In progress`, `On Hold`, `To Review`, `Done`, or `Cancelled`.
- `Priority`: `Urgent`, `High`, `Medium`, or `Low`, when a priority is justified.
- `Description`: short summary; put context, evidence, scope, dependencies and acceptance criteria in the page body.
- `Assign` and `Due Date`: set only when instructed; do not invent an owner or deadline.

New tickets start as `Not started`. Record triage separately in the body as `Triage: <role>` using [triage-labels.md](triage-labels.md); do not add schema properties or status options just to represent those roles.

Search for an existing ticket before creating one and confirm its project. Update the existing page for the same issue instead of duplicating it. Use native Notion comments for discussion and link dependent tickets directly.

## When a skill says "publish to the issue tracker"

Create or update a page in Tasks linked to DMMarket. Put a PRD or longer specification in the ticket body or an explicitly requested linked Notion page, not in a local issue directory. Return the ticket URL and use that URL in repository documentation when a reference is needed.

## When a skill says "fetch the relevant ticket"

Fetch the Notion page by URL or ID. If only a title or topic is provided, search Tasks and verify the DMMarket relation before using the result. Read its current scope, acceptance criteria and relevant comments before implementation.

If Notion is unavailable, report the blocker. Do not silently substitute `.scratch/` or claim a ticket was published. Domain documentation and ADRs remain in the repository; they are not copies of ticket state.
