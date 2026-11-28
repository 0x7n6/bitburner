# Mission coordination

AP's **Mission coordination** menu checks whether Singularity and home RAM
can support player-work automation. It selects the full BT4 faction and
study pilot when admission succeeds, or starts free Computer Science
through a smaller one-shot script when only that fits and the budget is
zero. AP reports the filename of the production process it actually sees.
Neither mission tool replaces production scheduling.

The work policy targets Bitburner 3.0.1 (3162fd2). It can use Singularity
inside BN4 or after acquiring Source-File 4, subject to live script RAM.
When Singularity is locked, status shows the first manual blocker. This
does not establish cold-boot compatibility for all BitNodes. The
lighter path requires an idle player and a local university.

| AP option | Effect |
| --- | --- |
| Show capability and RAM status | Read-only preview of the engine, work, stock access, and admission |
| Start work-only mission | Start a 15-minute work policy without an augmentation budget |
| Start work and Share | Start work plus the existing Share service if there is enough RAM for both |
| Start work and Trader | Start work plus long-only Trader, after entering a positive cash floor and confirming |

The Share path preserves at least 512 GB and enough room for a useful
first allocation. It will defer on the currently observed 128 GB home.
Trader requires TIX and 4S TIX, preserves its configured cash floor
for purchases, and refuses a concurrent augmentation purchase budget or
another capital service. Trader and Share have separate lifetimes
from the 15-minute work session and can continue after it expires.

`stp` pauses the OS and ends the mission controllers and Share. It halts
a mission-owned Trader while holding positions. A marker prevents daemon
from restarting that Trader under its generic defaults. A new launch
requires explicit Trader authorization. Existing player activity is
preserved. `stp-rs` rechecks a saved work-only authorization if its
original deadline and reset generation still match. It does not reuse
a prior purchase authorization. Resumed automation treats ongoing
activity as externally owned and can defer if another progression process
controls work. `stp-os` discards the saved work authorization.

## Runtime acceptance

1. Sync the changed scripts and reopen AP. Start with **Show capability
   and RAM status** while JIT5 runs. Check the actual engine name,
   Singularity, stock gates, and RAM. Compare `mem mission-study.ts`
   and `mem bt4-auto.ts` in the game.
2. Test **Start work-only mission** while already studying, then from
   idle. Verify the current activity is preserved in the first case and
   that the admitted tool starts work in the second.
3. Test Share and Trader in a controlled game save. Compare RAM before
   and after, verify the configured floor, and confirm absent TIX or
   4S TIX only produces a blocker.
4. Test pause/resume in a controlled window. Pause stops the running
   farm processes. Check that existing work and positions remain and
   that no financial policy is relaunched on resume. Confirm an
   expired or reset-mismatched work policy is refused.

Static checks and modeled behavior have been validated. Current game
measurements for the coordinator, lighter study path, and pause/resume
are pending.
