# Replace the files

1. Extract this ZIP into your original project folder. Overwrite matching files.
2. Keep your existing `.env`, `public/app-config.js`, logos and Supabase configuration.
3. Deploy the included `google-drive-oauth` Edge Function with its `_shared/certificate-design.js` file. This enables saving the template choice.
4. Run `npm install`, then `npm run build`, and deploy your app as usual.

The ZIP uses the normal authenticated app as the default build. It includes all approved certificate tools, three templates, custom designs, image uploads and the report template picker. Selection highlights stay in the editor and are excluded from report previews and exports.

No database migration is needed. The backend function must be deployed for the new report template selection to work; replacing frontend files alone does not deploy it.
