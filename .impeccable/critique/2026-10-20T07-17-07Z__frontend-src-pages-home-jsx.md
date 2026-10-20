---
target: frontpage + scheduling flow
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:D:\\Projects\\Movienight\\frontend\\src\\pages\\Home.jsx"
target_fingerprint: "sha256:2dddb4517c6ba053c0cd926c44607c7ad7b2f0028c4b65cce1ef80387e9be798"
target_path: "D:\\Projects\\Movienight\\frontend\\src\\pages\\Home.jsx"
timestamp: 2026-10-20T07-17-07Z
slug: frontend-src-pages-home-jsx
---
# Critique: frontpage + movie scheduling flow
Method: dual-agent (A: design review · B: detector + URL scan; overlay blocked by CSP)

## Heuristics (22/40, Acceptable)
1 Visibility 2: success shown before the bot posts; no Discord confirmation
2 Real world 3: good voice; "Tonight's feature" shown for films weeks away
3 Control 2: no undo after announcing; flow split between sidebar and section below the hero
4 Consistency 1: 3 scheduling UIs, 3 date pickers, 3 default times, 3 button labels
5 Error prevention 2: no clash warning when a day already has a screening
6 Recognition 2: Announce offers TMDB "Popular right now", not the club's board or wishlists
7 Flexibility 2: no default night or "same slot as last week"
8 Aesthetic 3: strong hero; generic stacked dashboard below
9 Error recovery 3: clear inline errors
10 Help 2: nothing explains what votes do

## Priority issues
- [P0] Mobile breakage: Last screenings overflows (scrollWidth 429 at 390), clipped times; downvote icon missing because chevron-down isn't registered in Icon.jsx (SuggestionBoard.jsx:261); "+ schedule" is hover-only (InlineScheduler.css:27); 30px nav targets
- [P1] Three inconsistent scheduling paths (ScheduleSection, the Board modal, AnnounceModal); build one ScreeningComposer
- [P1] Votes decide nothing: any member can announce any suggestion; the board doesn't feed the decision
- [P1] Metadata is unreadable: --bone-mute #6B6556 at 3.0–3.2:1 (15 hits); 9–10px hardcoded mono (14 hits: OnTheCalendar.css:5,7,15; Home.css:588,627)
- [P2] Below the hero: a generic stat/card/list stack, ~100px voids, numbering starts at 02, scheduling gets no ceremony

## Detector
Source scan 0 (regex only); URL scans: / 33, /movies 9, /wishlist 4. italic-serif-display and hero-eyebrow-chip are false positives (intended design system).

## Concepts
1 The Programme (fixed slot + rotating host) 2 Shortlist → vote → reveal 3 Date poll first, film second
