# Triage Labels

The skills use five canonical triage roles. In the Notion tracker, record the exact role in the ticket body as `Triage: <role>`; it is separate from the native `Status` property. See [issue-tracker.md](issue-tracker.md).

| Role | Meaning |
| --- | --- |
| `needs-triage` | Maintainer needs to evaluate this issue |
| `needs-info` | Waiting on reporter for more information |
| `ready-for-agent` | Fully specified, ready for an AFK agent |
| `ready-for-human` | Requires human implementation |
| `wontfix` | Will not be actioned |

When a skill says to apply a triage label, update that line in the existing Notion page. Do not create local label files or add Notion properties/options without instruction.

Use native `Status` to track execution: `Not started`, `In progress`, `To Review`, and `Done`. Use `On Hold` for blocked work and `Cancelled` for discarded work. A new `needs-triage` ticket normally starts as `Not started`; a `wontfix` decision is recorded as `Cancelled`.
