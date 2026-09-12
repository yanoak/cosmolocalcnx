# Plans

Every piece of substantial work gets a plan here **before** implementation starts, named
`YYYY-MM-DD_short-name.plan.md`. The date is the day the plan was *started* — a plan that runs a
week keeps the filename it was born with.

```
plans/2026-09-13_scene-schema-greybox.plan.md
plans/2026-09-16_osm-baseline-script.plan.md
```

Copy `_template.plan.md` to start one. Keep the frontmatter `status` current —
`draft` → `active` → `done` or `abandoned`. Abandoned plans stay in the folder: deleting them
loses the reason something was dropped, which is usually the part worth keeping.

## What earns a plan

Anything multi-step, cross-cutting, or that benefits from thinking before typing. Not every bug
fix and not every copy tweak — those can be an **Unplanned** commit and a line in the work log.

## The four conditional sections

The template carries four sections that are **required when they apply** and deleted when they do
not. They exist because each one catches a failure that is expensive to catch later:

| If the plan touches | Section | Why |
|---|---|---|
| User-visible UI | **UI mockups (ASCII)** | Settles layout and hierarchy before code, in the cheapest possible medium |
| Anything users click | **Keyboard interaction** | Agent-driven browser testing navigates by keyboard — no keyboard path means no agent verification |
| Any logic | **Test list (TDD)** | Written before the implementation steps, and the tests before the code |
| Anything users perceive | **Verification** | Named routes, keys and expected results, so "done" is checkable rather than asserted |

## Linking a plan to its commits

Commits that advance a plan carry a `Plan:` trailer naming the plan's slug — the filename without
`.plan.md`:

```
Grey-box building extrusion from footprint

Plan: 2026-09-13_scene-schema-greybox
```

That trailer is the whole linking mechanism, and it is the reason the diary's commit list cannot
drift: it is generated from git rather than maintained by hand. Decompose a plan's tasks to
roughly commit granularity so the mapping stays one-to-one.

## Marking things done

Tick `[x]` as each task lands — never leave a finished step unchecked. Move `status` to `done`
only when the verification section actually passed, and write the **Outcome**. A plan whose
outcome is empty six weeks after its last commit is either abandoned or lying; say which.
