# Self-hosting

Gateweave Forms runs on your own Cloudflare account as one Worker with one D1 database. This
page covers what a deployment needs beyond the code: its settings, the order of a deploy, and
the rules to set at Cloudflare's edge, which the repository cannot set for you. What the
deployment stores, and what deleting does, is in [data.md](data.md).

## Settings

| Name                 | What it does                                                                 |
| -------------------- | ---------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | Required secret. Signs the sessions of the people who run forms              |
| `BETTER_AUTH_URL`    | Optional. The app's own URL, which requests that change something must match |
| `SIGN_UP_ALLOW`      | Optional. Who may make an account: whole addresses, comma-separated          |
| `FORMS_EXAMPLES`     | Never on a deployment. `"1"` serves the made-up forms in `examples/`         |

Set `BETTER_AUTH_URL` and `SIGN_UP_ALLOW` on anything that is reachable from outside. Without
`SIGN_UP_ALLOW`, anyone who reaches the server can make an account and bring forms in. No email
is sent yet, so a listed address belongs to whoever signs up with it first: sign up straight
after listing yours. The README says more about both.

## Deploying

The scripts in `apps/web/package.json` deploy Gateweave's own staging environment
(`deploy:staging`, `db:migrate:staging`). For your own, do the same four steps against the top
level of `wrangler.jsonc`, in this order:

1. **Build**: `pnpm build`.
2. **Check the build**: `node apps/web/scripts/check-deploy.mjs apps/web/dist/server/wrangler.json`.
   It refuses a build that serves the example forms, which a build made for the browser tests
   does.
3. **Migrate the database**: `pnpm wrangler d1 migrations apply DB --remote`. Before the
   deploy, so that the new code never runs against a database that lacks a column it reads.
4. **Deploy**: `pnpm wrangler deploy`.

`pnpm wrangler` runs the pinned Wrangler from the repository root, where `wrangler.jsonc` is.
These steps are the staging scripts' own, written out for the top level of the configuration;
only the staging environment is deployed from this repository so far.

A form cannot be opened for answers until its definition names who runs it (`controller`: a
name and a way to reach them), which a form's Settings page can fill in. A form that was
already open when a deployment got this rule stays open; it has to gain the line before it can
be opened again after closing.

**On updating to the version with `withdrawal`:** every form whose definition does not set it
gets `"until-closed"`. Finished responses on open forms become withdrawable by whoever holds
their address, although their first page did not say so and the dialog under "Options" said
"until you finish the form". If a study on your deployment must keep the old rule, give its
form a definition with `"withdrawal": "until-complete"` before or straight after updating.
That holds for responses begun from then on; those begun earlier keep `"until-closed"` until
the form is closed. [data.md](data.md) has the reasoning.

**When someone deletes their account**, take their address off `SIGN_UP_ALLOW`. The app cannot
change a setting, and an address left on the list belongs to whoever signs up with it next.

## Rate limits at Cloudflare's edge

Two addresses of the app can be called by anyone, with no secret: starting a response
(`POST /api/forms/<form>/responses`) and storing an answer a form keeps apart
(`POST /api/forms/<form>/detached`). Signing in and signing up (`/api/auth/*`) take guesses.

The Worker limits these itself, through the Rate Limiting bindings in `wrangler.jsonc`:

- per form, 120 starts and 60 kept-apart answers a minute;
- per email address tried, ten tries a minute at signing in or up; per account, ten tries a
  minute at changing a password;
- per sender, thirty requests a minute to `/api/auth/*` that are not reads.

What the Worker cannot do is tell one respondent from another. It reads no network address for
anything a respondent sends, so its ceiling on a form is for everyone together: one sender
flooding a form's start address fills the ceiling and keeps real people out for as long as the
flood lasts. Stopping one sender without stopping everyone is the job of a rule at Cloudflare's
edge, which counts by network address before the request reaches the Worker, and so keeps the
address out of the Worker, its database and its logs. **A deployment without these rules has
the ceilings only.**

Set them in the Cloudflare dashboard as rate limiting rules, among the security rules of the
zone the Worker's domain is in. They belong to a zone, so the Worker needs a domain of your
own for them: a `workers.dev` address is not in a zone of yours. Two rules:

**1. Answering, per address**

| Field                        | Value                                               |
| ---------------------------- | --------------------------------------------------- |
| When incoming requests match | `starts_with(http.request.uri.path, "/api/forms/")` |
| With the same                | IP                                                  |
| Requests                     | 10                                                  |
| Period                       | 1 minute                                            |
| Then                         | Block (a 429), for 1 minute                         |

Only the two open addresses live under `/api/forms/`, and both are POSTs, so the path alone
selects them. A person starts a form once and sends what is kept apart once; ten a minute
leaves room for a household or an office behind one address, and for a class answering
together you would raise it for the session. A response's own addresses (`/api/responses/*`)
are deliberately not in the rule: they need the response's secret, and a long form sends an
answer every few seconds.

**2. Accounts, per address**

| Field                        | Value                                              |
| ---------------------------- | -------------------------------------------------- |
| When incoming requests match | `starts_with(http.request.uri.path, "/api/auth/")` |
| With the same                | IP                                                 |
| Requests                     | 20                                                 |
| Period                       | 1 minute                                           |
| Then                         | Block (a 429), for 1 minute                        |

This backs up the Worker's own count per sender, and stops a flood before it costs a request
to the Worker.

What your plan allows decides how close you can get to this:

- **Free**: one rule, a period of 10 seconds, a block of 10 seconds, and the expression may
  only look at the path. Use one rule for both paths
  (`starts_with(http.request.uri.path, "/api/forms/") or starts_with(http.request.uri.path, "/api/auth/")`)
  with, say, 5 requests in 10 seconds.
- **Pro**: two rules, periods up to a minute, blocks up to an hour: the two rules above as
  written.
- **Business** and up can also match on the method (add `http.request.method eq "POST"`), which
  keeps reads under `/api/auth/` out of the count.

These numbers are a starting point, not a measurement: watch the rule's events after a form
has had real traffic, and adjust. Planned for the app itself is Turnstile on Start, so that a
response is started by a browser a person is using.

Whatever you set there, Cloudflare keeps its own events for the rule, with the network
addresses it blocked. That is outside the app, and belongs in what you tell respondents if you
tell them what is recorded.

## Logs

`wrangler.jsonc` turns the Worker's invocation logs off, and the app's promise to store nothing
about who answered depends on that: an invocation log holds each request with its address and
what Cloudflare knows about where it came from. Keep it off, and do not add a Logpush job or a
tail consumer that records requests.

## Deleting, and the database's history

Every deletion in the app removes rows from the database as it is now. D1 keeps 30 days of its
own history on the Workers Paid plan (7 on the free plan), from which you, and only you, can
restore the database as it was. [data.md](data.md) says what follows from that, and what to do
if you ever restore.
