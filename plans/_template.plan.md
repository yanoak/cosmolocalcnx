---
slug: YYYY-MM-DD_short-name
status: draft
started: YYYY-MM-DD
finished:
issue:
---

# Title of the plan

## Context

What is true now, and what problem this addresses. Link the notes, issues and prior plans a
future session would otherwise have to rediscover.

## Goal

One paragraph. What is true when this is done, stated so it is obvious whether it has happened.

## Approach

The shape of the work — and, more valuably, the routes considered and rejected, with reasons.

## Tasks

<!-- Decompose to roughly commit granularity: each box should be one commit carrying this plan's
     `Plan:` trailer. Tick them off as you go; never leave a finished step unchecked. -->

- [ ]
- [ ]

## UI mockups (ASCII)

<!-- REQUIRED if this plan touches user-visible UI — new screens or components, layout or
     navigation changes, visual redesign, modal or panel structure. Wireframe boxes and labels,
     not pixel design. Include the states that differ materially: default, empty, loading, error.
     DELETE THIS SECTION if the change is strictly non-visual. -->

## Keyboard interaction

<!-- REQUIRED if this plan adds or changes anything users click: buttons, menus, modals, panels,
     canvas interactions, drag-and-drop. List:
       1. Tab order — what is focusable, in what order
       2. Shortcuts — key combo + action
       3. Focus management — where focus goes on open / close / navigate
     This is not only accessibility: agent-driven browser testing navigates by keyboard, so a
     feature without a keyboard path cannot be verified by an agent.
     DELETE THIS SECTION if nothing interactive changes. -->

## Test list (TDD)

<!-- REQUIRED if this plan touches logic — stores, utilities, validators, transforms, loaders,
     query generation, any pure module. One bullet per behaviour or edge case, each with its
     test layer and target file. Written BEFORE the implementation steps, and the tests are
     written before the code.
     DELETE THIS SECTION if there is no testable logic. -->

- [ ] behaviour — layer — `path/to/__tests__/thing.test.ts`

## Verification

<!-- REQUIRED if users perceive the change — layout, styling, copy, validation messages,
     loading and empty states, redirects, focus, keyboard flows. Spell out the actual steps:
     which route or modal to open, what to press, what should appear. Default to keyboard
     interaction; mouse only where no keyboard path exists yet (and file a follow-up).
     DELETE THIS SECTION only if the change has no user-perceivable surface. -->

## Out of scope

Explicitly not doing, so it does not creep back in.

## Open questions

- [ ]

## Outcome

_Filled in when this goes to `done` or `abandoned` — what actually happened, and what it changed
about the project's direction. If it changed a decision, that decision belongs in CLAUDE.md or
the architecture docs too._
