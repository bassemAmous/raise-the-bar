---
name: mind-the-headers
description: Read-only check of the security headers a live site really sends. Reads the intended header and cookie rules from the code first, fetches the real responses of each deployed surface, and checks the content security policy, HSTS, nosniff, the referrer policy, cookie flags and leaky server headers against that contract, with the value seen next to the value expected. Use when the user says "check the headers", "is the CSP right on the live site", "is HSTS on", "check the cookie flags", after a change to a proxy, middleware or header config, and on a new environment. Not for a full security audit (who-let-you-in) or for changing the headers.
---

# mind-the-headers

A header rule that lives only in the code is unproven. The policy can be right in the repository
and wrong at the edge: a proxy rule, a hosting platform's header settings, a middleware that now
runs in another order. This skill reads what the server really sends and compares it with what
the code intends, so "the CSP is fine" becomes a pasted header, not a belief.

It only reads. It sends ordinary requests, the kind any visitor sends, so it is safe on a live
site you are allowed to check.

## When to use

- After a change to a proxy, a middleware, the header config or the cookie code.
- When a new environment or domain goes live.
- When someone asks whether a header or a cookie flag is on.

## When not to use

- A full look at what an attacker can reach: use `who-let-you-in`.
- Changing a header: that is a code change, made and reviewed on purpose.
- A site you were not asked to check.

## Steps

1. **Read the intended contract from the code.** Search for where headers and cookies are set:
   the frontend config or middleware, the proxy config, the server's security settings. Note
   `Content-Security-Policy`, `Strict-Transport-Security`, and the name and flags of each cookie
   the app signs or uses for a session. The code says what should be there. The fetch says what is.
2. **Pick the surfaces.** A public page, a signed-in or admin page, and the API. Each app that
   serves HTTP can have its own header config, so check each one. Follow redirects: the final
   page is the one that matters.
3. **Fetch the headers** without the body:

   ```
   curl -sS -D - -o /dev/null -L "<url>"
   ```

   For several addresses, a small script beats reading by eye, and it can be run again after the
   next deploy.
4. **Check each rule against the contract:**
   - **Content security policy** is present and matches the code. `frame-ancestors 'none'` if the
     site must not be framed. A directive loosened on purpose (for example `img-src https:` for
     images from other hosts) is exactly as loose as intended: tighter breaks something quietly,
     looser is a regression. Where the app previews a local upload, `img-src` or `media-src`
     allows `blob:`.
   - **Strict-Transport-Security** is present with a sensible `max-age`.
   - **X-Content-Type-Options: nosniff** is present.
   - **Referrer-Policy** is set.
   - **Cookie flags**, where a response sets a session or signed cookie: `HttpOnly`, `Secure`,
     and `SameSite=Lax` or `Strict`.
   - **No leaky headers:** a `Server` or `X-Powered-By` header that names software and version.
5. **Compare the surfaces with each other.** Two frontends of one product often drift apart.
6. **Report** in the format below. For each failure, give the value seen, the value expected, and
   the file and line that sets it.

## Output format

```
mind-the-headers: <environment>, <N> addresses, checked at <time>

<url>
  Content security policy ...... PASS | FAIL (<seen> / expected <expected>)
  Loosened directives as meant . PASS | FAIL
  HSTS ......................... PASS | FAIL
  nosniff ...................... PASS | FAIL
  Referrer-Policy .............. PASS | FAIL
  Cookie flags ................. PASS | FAIL | not set on this response
  No leaky server headers ...... PASS | FAIL

Verdict: PASS | FAIL: <the one thing to fix first, and where it is set>
Not checked: <surfaces or rules skipped, and why>
```

## Hard rules

- Read-only. No change to any header, config or server from this skill.
- The contract comes from the code, read this run, not from memory.
- Paste the real header value for every finding.
- Say which surfaces were not checked. A silent gap reads as "checked and fine".

## Common mistakes

- Checking one app and assuming the others send the same headers.
- Checking the redirect response instead of the page it lands on.
- Calling a policy that is tighter than intended "more secure", while it breaks images.
- Reading the header from the code and calling that a live check.
