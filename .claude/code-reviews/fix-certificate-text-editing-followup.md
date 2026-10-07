# Code Review - Fix Certificate Text Editing

**Stats:**

- Files Modified: 1
- Files Added: 2 (plan and implementation report)
- Files Deleted: 0

Code review passed. No technical issues detected.

The change is scoped to the existing certificate editor. The new caret scheduling avoids double-click selection races, and the Backspace path handles collapsed and non-collapsed selections without invoking deprecated `execCommand`. The selection remains scoped to the active editor, and no render or persistence boundaries were changed.

Validation reviewed:

- `node --check src/legacy-app.js` passed.
- `npm run build` passed.
- Authenticated browser interaction remains a manual-test gap because no credentials were available.
