# Contributing to BlueRadar

Thanks for your interest. Some notes to make collaboration smooth:

## Before opening a PR

1. **Open an issue first** describing the bug or feature, so we can
   agree on direction before you spend significant time. Drive-by PRs
   for non-trivial changes are likely to be slow to merge.
2. **Test against current HA stable.** This project targets Home
   Assistant 2026.4 and later. PRs that break compatibility with
   current stable will be asked for changes.
3. **Keep PRs focused.** One change per PR. A PR that bundles a bug
   fix, a refactor, and a feature is hard to review.

## Style

- Python: follow standard HA integration conventions. Match the
  existing code style; we don't enforce a formatter yet but will
  likely add `ruff` shortly.
- JavaScript (the card): keep it dependency-free vanilla JS. No
  build step, no bundler, no framework. The card runs in the HA
  frontend's existing module loader.

## Things I'd particularly welcome help with

- Translations for languages other than English
- Additional manufacturer ID mappings in `const.py`
- Screenshots / a short demo GIF for the README
- Replacing the single-Bermuda-dependency with a pluggable backend
  interface so other location engines could be supported in future
- HACS default-store submission (after the project has had some
  community testing)

## Things I'm cautious about

- New dependencies in the integration. Anything that adds a
  `requirements:` entry to `manifest.json` needs strong justification.
- Changes to the wire format of the WebSocket or REST APIs. These
  are now public and need to be evolved with care.
- Changes that would break compatibility with Bermuda's current
  config-entry option layout.

## Code of Conduct

Be kind. Disagree by addressing ideas, not people. If discussion
gets heated I will step in to redirect or close threads.

## Licence

By contributing you agree that your contribution is licensed under
the same MIT terms as the rest of the project.
