# Feature: Fix Certificate Text Editing Caret and Backspace

## Feature Description

Repair certificate text-layer editing after double-click so the editor receives a deterministic caret and Backspace reliably removes selected or preceding text.

## User Story

As a coach editing a certificate layout, I want double-click editing and Backspace to behave like a normal text editor so that I can edit text without losing focus or characters.

## Problem Statement

`beginCertificateTextEditing()` enables `contenteditable` on rendered certificate overlays, but browser selection timing can leave the caret in an unexpected position. The document-level keydown handler can also see a Range whose container is the editable element rather than a text node, causing the custom deletion path to return without changing content.

## Solution Statement

Keep the existing vanilla DOM/editor flow. Defer focus and caret placement until the double-click has completed, place the caret after the final text node (or select the empty editor), and make Backspace normalize element-boundary selections before deleting one Unicode character or the active selection. Keep the handler scoped to the active editor and preserve Escape/Enter commit behavior.

## Out of Scope / Non-Goals

- Not changing certificate layout persistence, rendering, or report export.
- Not adding a new editor dependency or migrating away from native `contenteditable`.
- Not changing normal single-click drag/selection behavior for overlays.

## Feature Metadata

**Feature Type**: Bug Fix  
**Estimated Complexity**: Low  
**Primary Systems Affected**: `src/legacy-app.js` certificate editor event flow  
**Dependencies**: Native DOM Selection/Range APIs only

## CONTEXT REFERENCES

- `architecture.md` - confirms the application uses vanilla DOM rendering and delegated certificate interactions.
- `src/legacy-app.js:2004-2116` - text editor setup, caret placement, key handling, and deletion helper.
- `src/legacy-app.js:2811` - document capture listener for editor keyboard events.
- `src/legacy-app.js:3063-3119` - overlay click and double-click bindings; double-click must not trigger dragging or rerendering.
- `.claude/plans/fix-certificate-text-editing.md` - prior attempted fix and acceptance criteria.

## IMPLEMENTATION PLAN

### Phase 1: Harden editor selection and keyboard handling

- Replace timer-only caret setup with a post-event focus/selection callback that consistently targets the last text node.
- Keep the active editor record and document capture listener, but make Backspace work for selections whose Range starts/ends on the editor element or another element boundary.
- Delete a selected range or exactly one preceding Unicode code point, then restore the caret so repeated Backspace works.
- Preserve Escape and non-shift Enter commit behavior and stop Backspace propagation/default browser behavior only while editing.

### Phase 2: Validate

- Inspect the focused diff for event-order, selection containment, and persistence regressions.
- Run `npm run build`; no test, type-check, or lint scripts are defined in `package.json`.
- If the dev server is available, manually verify double-click, typing, repeated Backspace, selected-text Backspace, empty text, and Escape/Enter commit.

## STEP-BY-STEP TASKS

### UPDATE `src/legacy-app.js`

- IMPLEMENT deterministic post-double-click focus and end-of-content caret placement.
- IMPLEMENT Range normalization for element-container selections and explicit Backspace deletion, including surrogate pairs and previous text nodes.
- PRESERVE existing save-on-blur and Escape/Enter behavior.
- GOTCHA: do not call `render()` while the editor is focused; rerender would replace the active DOM node and lose the selection.
- VALIDATE: `node --check src/legacy-app.js`

### REVIEW changed behavior

- CHECK the delegated pointer/click handlers still ignore double-click text editing and text remains editable only for unlocked layers.
- VALIDATE: `npm run build`

## TESTING STRATEGY

No automated test runner is defined. Use focused code inspection plus manual browser verification of the editor workflow. Cover caret at end after double-click, click-position preservation while editing, Backspace at end/middle/start, selected text deletion, repeated deletion across nested text nodes, empty content, Escape, Enter, and Shift+Enter.

## VALIDATION COMMANDS

- `node --check src/legacy-app.js`
- `npm run build`

## ACCEPTANCE CRITERIA

- [ ] Double-click enters edit mode with the caret at the end unless the browser preserves a valid click selection.
- [ ] Backspace deletes selected text or the character before the caret, including at nested element boundaries.
- [ ] Typing, Escape, Enter, and Shift+Enter retain existing behavior.
- [ ] No editor action rerenders or loses the active selection unexpectedly.
- [ ] `npm run build` succeeds.

## OPEN QUESTIONS / ASSUMPTIONS

- Assumed default: double-click should place the caret at the end, matching the existing product expectation; preserving a valid explicit click selection is acceptable if the browser supplies one.
- Assumed default: browser-native contenteditable remains the editor implementation.

## AMENDMENTS

- 2026-10-07 - Created plan from the reported caret and Backspace regressions; scoped fix to the existing certificate editor.
