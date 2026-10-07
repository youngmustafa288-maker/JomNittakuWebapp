# Fix Certificate Text Editing

## Goal

Make double-click text editing reliable: focus the editable text at a deterministic caret position and ensure Backspace deletes text at the caret or within a selection.

## Findings

- Text editing is enabled in `src/legacy-app.js` by `beginCertificateTextEditing()`.
- The previous Backspace handler delegates to `document.execCommand("delete")`; this can fail when the editable child is not the active selection root.
- Caret setup runs synchronously during `dblclick`, while browser default selection and focus transitions can still affect it.
- Pointer handlers already avoid moving text overlays on a double-click; preserve that behavior.

## Implementation

1. Defer focus and caret placement until the double-click event has completed, then set the caret at the end of the final text node.
2. Replace `execCommand` Backspace with explicit Selection/Range deletion for selected text or one preceding character, including a preceding text node at a boundary.
3. Scope the key handler to the active editor, stop Backspace propagation, and keep Escape/Enter behavior unchanged.
4. Build and review the focused diff; the app has no test, type-check, or lint scripts.

## Acceptance Criteria

- Double-click enters edit mode with the caret at the end of the text.
- Backspace deletes the selected text or the character before the caret.
- Typing and existing Escape/Enter save behavior continue to work.
- `npm run build` succeeds.
