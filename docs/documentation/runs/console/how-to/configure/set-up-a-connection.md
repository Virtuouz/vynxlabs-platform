# Run log: console/how-to/configure/set-up-a-connection.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), at 1440 px, light theme, headless Playwright. No other width or theme was run, and no keyboard-only pass.
- Workspace: a dev workspace of my own, `cfg-walk` ("Configure walk"), instead of Sandbox, so as not to change Fernhill's. The stand-in server was running on `127.0.0.1:4020`.

## The steps as followed (final text, one pass)
1. **Configure > Connections**: empty list, "No connections yet" and **New connection** twice (header and empty state).
2. **New connection** opened the sheet titled "New connection" with **A new connection…** chosen.
3. Name `stock-prices`, Kind **HTTP**.
4. Address `http://127.0.0.1:4020`; **How the credential is sent** > **Authorization: Bearer**.
5. Token or key `vs_demo_51be22`.
6. **Save**: part 4 showed **Saved** and **Reached (200) in 40 ms.** The credential showed "Stored", **Replace**, **Remove**, "Stored encrypted. It is never shown." The "set … by …" words appear on the stored line only after the list reloads.
7. After closing, the row `stock-prices` read **Draft, never deployed**, **Reached** "40 ms · tested 10s ago", "Nothing deployed uses it", HTTP, `http://127.0.0.1:4020`.
8. **Operate > Deploy** listed the draft ("Deploying creates 1, changes 0 and removes 0.") with **Deploy 1 change**. After it the list showed "VERSIONS OF CONFIGURE WALK: v1" and the connection's draft was `null` (API).

## Other things seen while writing
- With the address `http://127.0.0.1:4020/vetsupply` the same Save showed "Failed (HTTP 404): http://127.0.0.1:4020/vetsupply answered 404." with **Change the token or key** beside it, and the list showed **Failed** with "HTTP 404: … answered 404." Changing the address to the root and pressing **Save again** gave **Reached (200)**. A path-only change showed no "address changed" notice.
- A production workspace (Clinics): **Set up a connection** and, on a connection that is declared and not deployed, **Set up** both opened the sheet; the first with the waiting connection chosen under **Connection** and the hint "One the next promotion brings, or that is declared here, and nothing has bound yet."
- OAuth 2.0 and Mail (SMTP) kinds: the sheets were opened and read (Provider, Directory (tenant) for Microsoft, Redirect address with Copy; Mail server, Port, Security, Sent from). They were not saved or tried against a provider or a mail server.

## The page got wrong (and was corrected)
- The first draft said production's **Set up a connection** has the name and kind "already chosen, follow steps 3 to 6"; the sheet shows the settings and the credential only. The page now says to give them as in steps 4 to 6.
- The brief said a test passes "below 400"; the code (`response.ok`) passes a 2xx. The page says 200 to 299.

## Not run
768 and 390 px, dark theme, a keyboard-only walk, the OAuth Connect round trip, a mail test, **Remove from here** (its confirmation text was read on a connection's page: "Remove stock-orders from here? Scripts that use it will fail until it is set up again. Used by 1: stock/reorder.").
