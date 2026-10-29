# Certificate Design

1. Choose Classic, Performance or Heritage, or upload a background.
2. Edit with Text and Uploads. The toolbar has font, size −/+, colour and B/I/U.
3. Drag or resize elements; double-click text. Save to My designs.
4. Fill in the report wizard.
5. In the final step, choose a template using the previews.
6. Generate the report. Its chosen design is saved with it and used for exports.

The original application shell and other pages retain their supplied UI. The gallery and report picker use separate stylesheets; the global stylesheet is unchanged.

Reusable designs belong to the coach in `coaches.report_layout`. Report records and selected design snapshots remain in the coach’s Google Drive. Image bytes remain in the existing Supabase Storage bucket. The snapshot excludes the gallery, variants and unused upload collection.

The supplied report-service update must be deployed before the frontend. No new database table or migration is required. Older reports without a design snapshot continue to render through the existing fallback.

The isolated preview uses synthetic data with no live credentials. Designs save locally; preview reports stay in memory. Live upload, Drive, PDF and QR scan checks still require the original configured staging environment.
