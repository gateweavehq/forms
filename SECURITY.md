# Security policy

## Supported versions

Gateweave Forms is in early development. Security fixes go into `main`. If releases begin, fixes
will also go into the latest release.

## Reporting a vulnerability

Please report vulnerabilities privately by email to **security@gateweave.com**, never in a public
issue or pull request. Once the repository is public, use its GitHub private security advisory
form.

Include what an attacker could do, the steps to reproduce it, and the affected commit. We aim to
reply within three working days, keep you updated while we work on a fix, and credit you in the
release notes unless you would rather stay unnamed.

## Scope

Areas where reports are especially valuable:

- Access to another account's forms, responses, results or exports through owner pages, server
  functions or `/api/owner/*`. A missing form, a form owned by someone else and no session must
  give the same answer.
- Password sign-in, sign-up, sessions and account changes through `/api/auth/*`, including the
  sign-up allow list and the limits on password tries.
- Public form pages under `/f/*`, `POST /api/forms/<form>/responses` to start a response, and
  `POST /api/forms/<form>/detached` to store kept-apart answers.
- `GET` and `DELETE /api/responses/<id>`, `POST /api/responses/<id>/progress`, and
  `POST /api/responses/<id>/complete`. These read, save, finish or withdraw a response. A
  response's secret must stay out of addresses, cookies and logs.
- Form definitions and Tally page data brought in through the owner API, and answers sent to the
  respondent API. These are checked before storage.
- Exposure of `BETTER_AUTH_SECRET`, response secrets, answers or the contents of D1 through a
  page, response, export or log. Kept-apart answers must not be paired with a response.
