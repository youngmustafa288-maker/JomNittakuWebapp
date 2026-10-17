# Code Review - Centre Login Branding

**Files Modified**: 2
**Files Added**: 2 workflow notes
**Files Deleted**: 0

Code review passed. The upload remains available from the dev-only console, uses existing image type/size validation, and updates `centres.logo_url` through the privileged function. The public centre lookup reads only display data, and inserted centre-controlled text/URLs continue to be escaped. No migration or permission broadening was needed. Production build and `git diff --check` pass.
