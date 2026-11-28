---
type: Task
id: CON-35
title: "The iPhone app carries the model calls"
pri: P1
dest: Ours
size: M
state: todo
---

Decision 0105 and the 4a brief §4 (step 5), in StGerman/nat20-app. The relay in the Swift client opens `/relay` with the relay token from the link. For each `call` it POSTs the body unchanged to `https://api.openai.com/v1/responses`, adding only `Authorization`, and sends every SSE `data:` payload back as an `event`, then `done` with the status and the error `code`. A 401 refreshes once and retries; if the refresh fails, it sends `done 401` and `signed_out`. `cancel` aborts the call. When the app is about to leave the screen, it asks iOS for background time to finish the calls in flight. It is a separate socket from the page's, and the page never sees it.

Depends on: AGT-148, CON-34.

Check: Swift tests against a local fake server for the call, the stream, 401 and refresh, 429, cancel and the background finish, no model; then one live call through Stas's phone.

## Status

todo. Written 2026-11-28 from decision 0105.
