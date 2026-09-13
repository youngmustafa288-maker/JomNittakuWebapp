# Feature: Individual Certificate Layers

## Goal

Keep the blank 896x1200 certificate template fixed while making every visible item from Image 1 an independently selectable, movable, resizable, hideable, and ordered overlay.

## Implementation

1. Replace grouped artwork crops with narrowly bounded item crops for the logo, each heading/label, each bullet, each divider/remarks line, badge, contact parts, and footer.
2. Preserve dynamic report fields as individual DOM overlays and make student photo, coach photo, and QR use the same saved layer geometry.
3. Restore the layer list in the Certificate Design sidebar and add height, visibility, and layer-order controls.
4. Add resize handles to visual layers and persist all changes through the existing per-coach `report_layout` save path.
5. Validate with `npm run build` and review the complete diff for fixed-template and export regressions.

## Acceptance Criteria

- The certificate background cannot be selected, moved, or resized.
- No combined header/session/summary/contact artwork boxes remain.
- Every visible reference item has its own layer entry and drag target.
- Photos and QR can be moved and resized independently.
- Coordinates, visibility, and order persist for the current coach.
- Preview and export use the same layer configuration.
