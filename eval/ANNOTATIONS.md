# Independently authored annotation tables

**SYNTHETIC authored vector sketches. These are not human handwriting or photographs.**

Legend: `.` floor, `#` wall, `P` player, `C` crate, `K` key, `D` locked door, `E` exit, `@` conflicting player + crate.

Each ASCII cell is the ground-truth annotation. A separate annotation reader maps these tables to board data, then the production validator checks board constraints. This structural check is not an independent human review or evidence of extraction accuracy.

## dev-01-corner-path (dev)

```text
P..E
.#..
.C..
....
```

Validation: 0 structural issues.

## dev-02-key-lane (dev)

```text
.P#.
.KD.
.C..
...E
```

Validation: 0 structural issues.

## dev-03-small-court (dev)

```text
#####
#P.K#
#C#.#
#..E#
#####
```

Validation: 0 structural issues.

## dev-04-two-boxes (dev)

```text
P....
.#C#.
..K..
.C#D.
....E
```

Validation: 0 structural issues.

## dev-05-narrow-hall (dev)

```text
######
#P...#
#.##K#
#C.D.#
#...E#
######
```

Validation: 0 structural issues.

## dev-06-open-islands (dev)

```text
P...#.
.#C...
..#K..
.C..#.
.#D...
.....E
```

Validation: 0 structural issues.

## dev-07-long-court (dev)

```text
#######
#P....#
#.C##.#
#..K..#
##.D..#
#....E#
#######
```

Validation: 0 structural issues.

## dev-08-large-field (dev)

```text
P.......
.##..C..
....#...
..K.#...
.C......
...D.##.
........
.......E
```

Validation: 0 structural issues.

## dev-09-key-only (dev)

```text
P.K.
.##.
....
.E..
```

Validation: 0 structural issues.

## dev-10-box-path (dev)

```text
..P..
.C#..
.....
..#C.
E....
```

Validation: 0 structural issues.

## dev-11-wide-room (dev)

```text
P.....E
.#C#...
..K.D..
.......
```

Validation: 0 structural issues.

## dev-12-tall-room (dev)

```text
P...
.C#.
....
.K..
..D.
#...
...E
```

Validation: 0 structural issues.

## heldout-01-left-exit (heldout)

```text
..#P
.C..
.#K.
E.D.
```

Validation: 0 structural issues.

## heldout-02-central-player (heldout)

```text
E...
..#.
.PC.
....
```

Validation: 0 structural issues.

## heldout-03-crooked-room (heldout)

```text
#####
#..P#
#K#C#
#ED.#
#####
```

Validation: 0 structural issues.

## heldout-04-crossing (heldout)

```text
..P..
C.#..
.KD#.
..#C.
.E...
```

Validation: 0 structural issues.

## heldout-05-bottom-start (heldout)

```text
######
#E.D.#
#.#K.#
#.C..#
#..P.#
######
```

Validation: 0 structural issues.

## heldout-06-scattered (heldout)

```text
.....P
..C.#.
.#..K.
...#..
.D.C#.
E.....
```

Validation: 0 structural issues.

## heldout-07-key-pocket (heldout)

```text
#######
#E....#
#.##C.#
#D..#.#
#..K..#
#....P#
#######
```

Validation: 0 structural issues.

## heldout-08-spacious (heldout)

```text
.......P
..C.##..
.#......
....K#..
...#....
..C.D...
.##.....
E.......
```

Validation: 0 structural issues.

## heldout-09-collectible (heldout)

```text
E.#.
....
.K#.
..P.
```

Validation: 0 structural issues.

## heldout-10-separated (heldout)

```text
P.#.E
..#..
C.#..
..#C.
..#..
```

Validation: 0 structural issues.

## heldout-11-wide-bottom (heldout)

```text
...C..P
.##.K..
..D.#..
E......
```

Validation: 0 structural issues.

## heldout-12-tall-bottom (heldout)

```text
E...
.#D.
..K.
C...
..#.
....
...P
```

Validation: 0 structural issues.

## reject-01-no-player (rejection)

```text
...E
.C..
....
....
```

No player is drawn. Ask the user to place one.

Annotation errors: player.

## reject-02-two-players (rejection)

```text
P..E
..P.
....
....
```

Two player glyphs conflict. Ask which one is the start.

Annotation errors: multiple_player_glyphs.

## reject-03-no-exit (rejection)

```text
P...
.C..
....
....
```

No exit is drawn. Ask the user to add an exit.

Annotation errors: exit_count.

## reject-04-two-exits (rejection)

```text
P...E
..#..
.C...
.....
E....
```

Two exits conflict. Ask which exit is intended.

Annotation errors: exit_count.

## reject-05-key-missing (rejection)

```text
P...E
..D..
.#...
.....
.....
```

A locked door is drawn without a key. Request a key or removal of the door.

Annotation errors: door_requires_key.

## reject-06-overlap (rejection)

```text
@..E
.#..
....
....
```

A player and crate are superimposed in the same cell. Request a correction; do not silently choose one.

Annotation errors: player_overlap.
