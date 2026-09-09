# Certificate Editor Continuation

## Correct User Requirement

The certificate background/template must remain fixed and must not be draggable or repositionable.

The coach should be able to edit the visible certificate layers on top of the fixed template, including:

- Dao Sports Method wording and other certificate headings
- Logo/seal/circle area, with the ability to upload or choose a coach/centre logo
- Student photo placement, size, crop, and visibility
- Coach photo placement, size, crop, and visibility
- Fixed labels such as STUDENT, COACH, date, centre, and training headings
- Dynamic report text fields
- Positions, sizes, fonts, colours, alignment, visibility, and layer order for editable elements

This should feel like a Canva-style certificate designer, but scoped to certificate layers. It is not a freeform editor for moving the entire certificate image.

## Current Implementation State

The current branch already contains:

- A coach-only `Certificate Design` dashboard tab.
- Per-coach `report_layout` persistence in Supabase.
- Text overlay editing for report fields.
- Dragging and typography controls for existing overlay fields.
- Supabase migration applied remotely:
  `add_report_layout_to_coaches`
- Latest pushed commit: `8a0c8d4 Expand certificate editor to full layout layers`

## Important Correction Needed

The latest implementation incorrectly exposes the fixed certificate background JPG as an editable layer. Remove that behavior:

- Do not show `background` as a selectable layout field.
- Do not make the certificate background draggable.
- Do not persist background X/Y/width changes.
- Keep the fixed template image at its original report dimensions.

## Recommended Layer Model

Add a `certificate_layers` object or array to the coach's `report_layout`, for example:

```js
{
  layers: [
    { id: "brand-title", type: "text", text: "Dao Sports Method", ... },
    { id: "brand-logo", type: "image", source: "coach-logo", ... },
    { id: "student-photo", type: "photo", source: "student", ... },
    { id: "coach-photo", type: "photo", source: "coach", ... },
    { id: "student-label", type: "text", text: "STUDENT", ... },
    { id: "coach-label", type: "text", text: "COACH", ... },
    { id: "date", type: "dynamic-text", field: "date", ... }
  ]
}
```

Each editable layer should support:

- `left`, `top`, `width`, `height`
- `visible`
- `zIndex` or array order
- Text-specific `fontFamily`, `fontSize`, `fontWeight`, `color`, `align`
- Image-specific `objectFit`, `objectPosition`, and source selection

## Files To Continue From

- `src/legacy-app.js`: certificate rendering, Certificate Design tab, layout persistence, and PDF export.
- `src/styles.css`: certificate editor controls and overlay styling.
- `supabase/migrations/20260909_000012_report_layouts.sql`: per-coach layout column migration.
- `public/Image 1.jpg`: fixed certificate background/template.

## Next Session Acceptance Criteria

- The JPG certificate background cannot be moved or resized.
- The Certificate Design tab shows a layer list for editable certificate elements.
- Coach can edit the brand title and other fixed text.
- Coach can upload/select a custom logo for the logo/seal area.
- Coach can reposition, resize, crop, and hide student and coach photos.
- Coach can edit visibility/order and styling of supported layers.
- Changes are scoped to the current coach and persist in Supabase.
- Report preview and PDF export use the saved layer configuration.
- Existing report generation and template dimensions remain unchanged.

## Validation

Run:

```text
npm run build
```

Do not modify or delete the existing certificate image assets while implementing the editor.
