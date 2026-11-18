# Changelog

Notable changes to Gateweave Forms, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). There is no tagged release yet.

## [Unreleased]

### Added

- Form definitions, shared validation and flow, and an importer for Tally page data.
- Respondent cards that save answers as they are given, resume from a link, and let a person
  withdraw a response when the form allows it. Kept-apart answers are stored separately.
- Password accounts, owned forms, settings, results by definition, response views and CSV exports.
- A single Cloudflare Worker with D1, a staging deployment path, and CI and browser tests.

### Fixed

- Saved answers are checked against the definition a response started under. Answers closed by
  a later change are removed, and a resent save's active time is counted once.
- Failed database reads that can pass on retry are sent again. Failed queries keep bound values
  out of logs and error responses.
