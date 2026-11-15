# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## Reconciliation with the labels this board already applies

The five strings above were kept unchanged rather than renamed, because this board's live
vocabulary already contains two of them verbatim and nothing that competes with the other three.

Applied to open issues as of 2026-09-09: `ready-for-agent`, `type:task`, `type:bug`,
`type:spike`, `type:epic`, `enhancement`.

- `ready-for-agent` matches the canonical role string exactly. No mapping needed, and no duplicate
  label is created.
- The `type:*` labels and `enhancement` are a **category** vocabulary — what a piece of work _is_.
  The five roles above are a **state** vocabulary — whose turn it is and whether the work is ready.
  They are orthogonal: an issue is legitimately `type:bug` **and** `needs-info` at once. Do not map
  a `type:*` label onto a triage role, and do not treat the absence of a role label as implying a
  category.
- **Three of the five roles have no label on the repo yet.** Queried 2026-09-09:
  `ready-for-agent` (no description) and `wontfix` ("This will not be worked on") exist;
  `needs-triage`, `needs-info` and `ready-for-human` **do not**. Create those three
  (`gh label create <name>`) before `/triage` first applies one — `gh issue edit --add-label`
  fails on a label that does not exist.

## Labels beyond the five roles

These four, plus `agent-filed`, sit beside the five roles. They were created on 2026-11-14
under Brandon's approval, for the friction intake and the daily sweep.

| Label              | Meaning                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `quick-win`        | One small PR closes it; no decision needed                                |
| `needs-brandon`    | Waiting on a decision only Brandon can make; the sweep skips it           |
| `friction`         | One item of workflow friction an agent recorded; the daily sweep reads it |
| `friction-skipped` | The daily sweep will not re-investigate it until this label is removed    |

- **`needs-brandon` is not `ready-for-human`.** `needs-brandon` means the next move is a
  _decision_ only Brandon makes: scope, product direction, a trade-off or an authority call. Once
  he decides, the issue moves on to whatever state fits, often `ready-for-agent`.
  `ready-for-human` means the work is decided and specified, but a _person must implement it_
  (an agent cannot do it). Don't use either one in place of the other.
- **`friction`** issues come from the friction form (`.github/ISSUE_TEMPLATE/friction.yml`), one
  item per issue, filed at delivery close and titled `Friction: …`. An agent files with
  `gh issue create --label friction --label agent-filed` so neither label can be dropped. Search
  open `friction` issues first and comment on a match instead of filing a duplicate.
- **`friction-skipped`** and **`needs-brandon`** both take an issue out of the sweep.
  `friction-skipped` parks it with no decision pending; `needs-brandon` parks it until Brandon
  decides.
- **`quick-win`** is a size marker, orthogonal to the role labels: an issue can be `quick-win`
  and `ready-for-agent` at once.

**Live labels, queried 2026-11-14:** `ready-for-agent`, `wontfix`, `agent-filed`, `friction`,
`needs-brandon`, `friction-skipped` and `quick-win` exist. `needs-triage`, `needs-info` and
`ready-for-human` still **do not**, so the note above still applies to those three.
