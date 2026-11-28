# Assisted BN4 progression

This follows Operation Singularity R3, sections 22 and 26–29. AP's **BN4 mission**
menu combines the alpha1 snapshots, a progression plan, and three one-shot
Singularity actions. Bitburner v3.0.1 at 3162fd2 is the reference version.

| AP option | Result |
| --- | --- |
| Basic snapshot / Singularity detail | Observe the player, processes, resources, and mission requirements |
| Plan progression | Rank accessible augmentations, show ready purchases and reputation gaps, expose queued prerequisites, and quote the next home RAM upgrade |
| Start faction work | Confirm one background work action at a joined faction while the player is idle |
| Buy one augmentation | Confirm one purchase with an explicit price cap and cash floor |
| Upgrade home RAM | Confirm one upgrade with an explicit price cap and cash floor |

Start with **Plan progression**. Enter the cash reserve you want to protect.
Each purchase also asks how much you are willing to pay and how much cash
must remain. Plan again after each purchase because augmentation prices can
change with the queue. For faction work, use the plan's listed work types.
Finish existing player work in-game before choosing to start a new action.
Faction work can continue after the observer exits. The player can stop it
using the regular game UI.

Ranking favors hacking skill, XP, reputation and speed, and gives a small
boost to prerequisites for offered augmentations. The Red Pill is prioritized
within BN4. Scores express preferences, not predicted completion times.
A queued prerequisite counts for a purchase. Only installed entries count
toward the Daedalus installed augmentation requirement. NeuroFlux purchases
remain manual because their levels and prices scale separately.

Actions check pause state and emergency RAM, take one live quote, ask for
approval, and validate again immediately before executing. A changed quote,
reset generation, existing work, new BT4 action, or conflicting spending
service can invalidate approval. Purchases check trader, traderctl and fleet
processes on home. The cash floor applies to the approved purchase itself.
Each separate spender still owns its future decisions. Reset and installation
remain separate operator decisions.

Mechanics references at 3162fd2:

- [Singularity API implementation](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions/Singularity.ts)
- [Augmentation eligibility and purchase](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Faction/FactionHelpers.tsx)
- [Augmentation pricing](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Augmentation/AugmentationHelpers.ts)
- [Player work lifecycle](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Player/PlayerObjectWorkMethods.ts)

## Verify in Bitburner

1. Sync `ap.ts`, `bt4.ts`, `bt4-detail.ts`, `bt4-plan.ts`, and
   `bt4-action.ts` to home. Confirm each arrived. Close old AP and run `run ap.ts`.
2. Measure each tool with `mem` and compare available home RAM with the
   tool plus `mem stopfarm.ts`. Use **BN4 mission** to verify AP admission.
3. Run the read-only plan and compare offered names, current prices, queued
   prerequisites and faction reputation to the game UI.
4. Exercise cancellation and insufficient budget before approving a real
   transaction. Compare cash, queued augmentations and home RAM before and after.
5. Verify faction work refusal while working. When ready to change work, stop
   the current activity in-game, approve the new one, and verify it continues
   after bt4-action exits. Keep JIT5 running during normal observer validation.

Real game validation and RAM measurements are pending. Local tests exercise
approval, stale quote, cash floor, action conflicts, pause, reset generation,
RAM headroom, and queued prerequisites. JIT5 prep ownership and allocator
diagnostics remain separate R3 milestones.

## Repository checks

`Script checks` runs on pushes and pull requests that change scripts or their
validation inputs. The workflow skips Markdown-only changes. It compiles
tracked Python under `scripts/` for syntax, downloads the pinned game
declarations and verifies their SHA-256, typechecks Netscript, and runs the
progression tests. The workflow is also available for manual runs.
