# SketchQuest: a puzzle workbench with checkable AI changes

## The problem

Turning a drawing into a game is memorable, but an interpretation can be wrong and an apparently clever edit can make the game impossible. A convincing portfolio project needs to show what was inferred, let people correct it, and distinguish a model suggestion from a proven game property.

## The experience

SketchQuest keeps the board central. A player can draw by hand in the editor or submit a photograph for interpretation. The proposed board remains distinct from the current board. Every accepted edit creates an immutable local revision and starts a new play session.

Natural-language changes return bounded cell edits. The application validates them, displays the differences, and runs an exact solver. For a longer-route request, both initial boards must have verified shortest solutions and the proposed solution must be strictly longer. Playback uses the actual game rules, so the proof is something people can watch.

## Engineering choices

Terrain and occupants are separate: a crate may cover a key without collecting it. Game state includes player position, canonical crate positions, and permanent key possession. The same pure transition powers gameplay, history reconstruction, breadth-first search, and replay. Independent rule fixtures and a separately implemented reference solver check the shared transition instead of simply assuming shared code is correct.

The browser performs expensive search inside a Web Worker, leaving the server with bounded requests, validation, AI calls, and small database writes. Job, revision, and content identities prevent stale results from verifying a changed puzzle. Server-generated shared snapshots contain only the public board and its title.

The project uses a single Cloudflare deployment: React/Vite static assets, Hono Worker APIs, D1 snapshots, and Workers AI. Free-plan enforcement and explicit failure states are part of the design. There is no paid fallback when free quota runs out.

## What is demonstrated now

The authored first puzzle has a shortest solution of six moves. A prepared one-cell wall change increases it to ten, and both paths replay successfully. That prepared example is labeled in the interface; it is not presented as a live model response. Automated tests cover the core algorithm and its integration with editing, history, replay, sharing, and error handling.

The benchmark and evaluation commands generate reproducible reports. Synthetic authored SVGs exercise dataset splitting and scoring. They do not establish real handwriting accuracy. Live model quality, production latency, and actual-photo results must be added only after free-account setup and a real evaluation run.

## Lessons and limitations

An immovable crate is not necessarily a deadlock: this game requires reaching an exit, not placing every crate on a target. Another subtle rule is that a push into a locked door cannot borrow the key the player would collect later in the same move.

The first implementation also exposed a real JavaScript validation error: sparse arrays bypassed array callbacks. The failure, fix, and regression are documented in [failure-case.md](failure-case.md).

Shortest route length is only one difficulty proxy. Loose drawings still need review. Free quotas constrain availability, and local storage is not a cloud backup. These are explicit limits of the first release rather than hidden claims of completeness.

## 60-second demonstration

| Time   | Action and narration                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| 0–10s  | Show an owned drawing and upload it: “A little drawing becomes a playable puzzle.”                                |
| 10–20s | Inspect the proposed grid, correct a cell: “The interpretation is a draft. I can see and fix uncertainty.”        |
| 20–30s | Accept and make a few moves: “The game is a deterministic set of rules.”                                          |
| 30–45s | Ask for a longer shortest solution: “The model suggests cells to change. Breadth-first search checks the result.” |
| 45–55s | Show before/after counts, accept, replay: “Every step is replayed through the same rules.”                        |
| 55–60s | Open the immutable share link: “The puzzle travels. The photograph stays private.”                                |

With AI unavailable, explicitly introduce the prepared example as such and demonstrate the same validation flow. Do not substitute it silently for the live interpretation/edit segment.
