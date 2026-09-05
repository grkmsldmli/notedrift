# Post-Deploy Manual Smoke Test — NoteDrift

Run this against **https://notedrift.com** after deployment (stage I of the
launch checklist). These need a real device / browser / microphone and a real
card, so they can't be fully automated. Check each box.

> The Stripe LIVE steps create a real charge. Use a card you control and **refund
> it from the Stripe Dashboard** afterward.

## Desktop (Chrome/Firefox/Safari)

- [ ] `/` loads directly into the canvas (no login wall, no onboarding).
- [ ] Draw with the pen.
- [ ] Add text.
- [ ] Add shapes (rect / ellipse / line / arrow / sticky).
- [ ] Insert an image (paste and/or drag-drop).
- [ ] Undo / redo.
- [ ] Autosave: make a change, wait, refresh — the work is restored.
- [ ] New Page, then switch between pages.
- [ ] Export PNG.
- [ ] Tools dropdown in the header opens (Sound Meter / Tap BPM / Metronome / View All Tools).
- [ ] PDF Editor (`/tools/edit-pdf`): open a PDF, edit, download.
- [ ] A converter (e.g. PNG→JPG) converts and downloads.

## Auth

- [ ] Magic link: request, click the link, land signed in.
- [ ] Cross-browser magic link: request in browser A, open the link in browser B — still signs in.
- [ ] Log out, then log back in.

## Cloud

- [ ] Save a canvas to the cloud.
- [ ] Open it fresh (or on another device) and it hydrates.
- [ ] Free account: a **4th** cloud canvas is rejected (at the cap).
- [ ] Pro account: a 4th (and beyond) cloud canvas succeeds.

## Stripe LIVE billing

- [ ] Monthly checkout completes (real card).
- [ ] Yearly checkout completes.
- [ ] Success returns to the app and reconciles → the account becomes **Pro**
      ("Activating Pro…" → Pro).
- [ ] Manage Billing opens the Stripe Customer Portal.
- [ ] Cancel at period end in the portal → app reflects `cancel_at_period_end`;
      Pro access continues until the period ends.
- [ ] Stripe Dashboard shows the webhook deliveries succeeding (200).
- [ ] Refund the live test charge(s) from the Stripe Dashboard.

## Audio tools

- [ ] Sound Meter requests microphone permission and the reading responds to sound.
- [ ] Stop releases the microphone (the OS mic indicator turns off).
- [ ] Tap BPM computes a tempo from taps.
- [ ] Metronome produces an audible click.

## Mobile — iPhone Safari

- [ ] Canvas is usable (draw, pan, zoom).
- [ ] No horizontal header overflow.
- [ ] More (…) menu works.
- [ ] Tools links reachable (from the More menu on narrow widths).
- [ ] Sound Meter requests microphone permission and reads.
- [ ] Metronome plays after a user gesture (mobile autoplay gate).

## PDF

- [ ] Edit a PDF (text, highlight, draw, whiteout, signature).
- [ ] Export / download the edited PDF; the result opens correctly.

## Legal / SEO

- [ ] `/privacy` and `/terms` load and are readable on mobile.
- [ ] `/robots.txt` and `/sitemap.xml` are served with the correct
      `https://notedrift.com` URLs.
- [ ] Footer legal links (Privacy / Terms) work from `/tools`.
