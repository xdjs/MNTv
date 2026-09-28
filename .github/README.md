# Pull request reviews

This repository uses the Codex GitHub integration for automated code and security reviews. The integration is configured outside GitHub Actions; it does not require a review workflow or an API key in this repository.

Codex reviews new pull requests and new commits automatically. To request another pass, comment `@codex review` or `@codex security review` on the pull request. Confirm the reviewed commit in the Codex Review Summary, address findings, and resolve the review threads after verification.

The obsolete Claude Code Review workflow was removed on 2026-09-28. It depended on a Claude GitHub app that is no longer installed.

Automated review comments do not replace the main branch's required approving review. Keep branch protections and required thread resolution enabled.
