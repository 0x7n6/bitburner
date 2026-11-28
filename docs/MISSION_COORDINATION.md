# JIT6 mission coordination

The `ap.ts` menu **JIT6 dashboard** reports the active BitNode, Source-Files,
home RAM, managed processes, recent admission decisions, and messages from the
active player-work pilot. Its BitNode and
faction catalogs cover all 15 nodes and 34 factions in Bitburner v3.0.1
(`3162fd2`). Faction details add live eligibility, reputation, augmentation
quotes and prerequisites when Singularity is available. The multiplier view
requires BN5 or active SF5.

**JIT6 sessions** runs on `home`. The scheduler rechecks the reset generation,
measured RAM, and spending conflicts. Player work
requires BN4 or active SF4. The lightweight worker can start free Computer
Science when the full pilot does not fit and the purchase budget is zero.

| Session option | Behavior |
| --- | --- |
| Preview admission | Reports the next work or home-upgrade decision without launching a task |
| Start continuous work | Runs faction work or free study without a timer or purchase budget |
| Start work session | Runs faction work or free study within the requested duration |
| Work with an augmentation budget | Queues eligible augmentations within the total budget and cash floor, even if existing player work is still active |
| Work with one home upgrade | Checks the current RAM upgrade quote against the approved price and cash floor |
| Work and Share | Uses remaining home RAM after accounting for emergency controls and reopening AP and its dashboard |
| Work and Trader | Starts a long-only Trader with TIX, 4S TIX and the approved cash floor |

When a managed session starts, JIT6 can switch an existing university course
directly to eligible faction work or free Computer Science. If the active
course is already the selected free class, the full pilot uses it as its
current activity and keeps checking for faction work. Leaving a class in
place after a rejected replacement preserves the player's current activity.
On a new session, the pilot can resume faction work when its faction and
work type match the current plan. Manual changes after the pilot takes
ownership end the pilot with a reason. With Formulas.exe, the pilot uses the
current player and faction favor to find the
quickest useful reputation unlock when starting a new goal. The Red Pill
takes priority on the standard route. BN15 has a different source for it.

The pilot starts faction work in the background. Its estimates use 80% of
the base reputation rate until the Neuroreceptor Management Implant is
installed. The planner scores the implant for removing that penalty. See
[official faction work](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Work/FactionWork.tsx#L38-L45)
and the [implant definition](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Augmentation/Augmentations.ts#L1229-L1240).

In AP, **Progression tools → Plan progression** prints the current activity,
cash above reserve, and the top purchase quotes and reputation gaps in short
lines. The terminal command `run bt4-plan.ts --reserve 0` returns the JSON
observation. Add `--summary` for the AP format.

Use **JIT6 dashboard → BitNode goal** to check the live gates for the current
node's completion route. On the standard route, track Daedalus cash, installed
augmentations, skills and the Red Pill separately. Use **Progression tools →
Rank faction invitations** to compare open invitations that would add
progression offers within the chosen cash reserve. This refreshes the game's
invitations and highlights incompatible city factions before joining. In
**Accept a faction invitation**, the confirmation lists any exclusions using
the current save. The action rechecks the invitation and reset generation
after confirmation.

In a budgeted session, JIT6 can move a pricier ready augmentation ahead of a
cheaper preferred upgrade when the budget, cash floor and remaining purchase
slots still cover both after repricing. The Red Pill retains priority. JIT6
reads fresh quotes after each purchase.

Share starts as soon as the controls and at least one worker thread fit. When
home RAM demand rises, managed Share releases threads to restore headroom.
A combined session also accounts for a pending Trader launch. Trader runs in
a session without an augmentation or home-upgrade budget. `stp` ends JIT6 and
its services while preserving player activity and holding Trader positions.
`stp-rs` starts continuous work and free study with a zero purchase budget.
When RAM only fits the lightweight study check, the scheduler starts it once
and promotes to the full pilot when RAM becomes available. Use `stp-os` to
stop a running legacy supervisor before resuming JIT6. Timed AP sessions are
available for purchases, Share, and Trader.

**Augmentation reset readiness** lists the observed queue, installed Red Pill
status and active services. An augmentation installation in the same BitNode
resets cash, skills, faction reputation and stock positions. Home scripts, RAM
and cores are retained. Review the game UI before installing or choosing a
new BitNode.

## In-game acceptance

1. Sync `scripts/` and reopen AP. Check the current BitNode, Source-Files,
   active process names and free RAM under **JIT6 dashboard**.
2. Start continuous work while studying. Verify that the dashboard shows the
   policy and reports reusing the chosen course or switching to the eligible
   replacement. Use `stp` to stop scheduler control and `stp-rs` to resume.
3. Try Share on a controlled save. Compare free RAM with the measured cost
   of `stopfarm.ts`, `ap.ts`, and `jit6-dashboard.ts`. Start and stop Trader in
   a separate controlled session and confirm the in-game cash floor.
4. Read **Augmentation reset readiness** before installing. After a reset,
   start a new session for the new state. Check that JIT6 shows the correct
   BitNode and recognizes the capabilities available in that cycle.

The automated tests model API responses and process ownership. They cannot
measure script RAM or timing in a live game save.

## References

- [Official Netscript declarations for v3.0.1](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/ScriptEditor/NetscriptDefinitions.d.ts)
- [Official faction eligibility and work](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Faction/FactionInfo.tsx)
- [Official player activity replacement](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/PersonObjects/Player/PlayerObjectWorkMethods.ts#L5-L10)
- [Official generic augmentation repricing](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Augmentation/AugmentationHelpers.ts#L25-L33)
- [Official augmentation and reset mechanics](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Documentation/doc/en/basic/augmentations.md)
- [Community faction work selection](../sources/alainbryden/work-for-factions.js) and [stock reservation/commission handling](../sources/alainbryden/stockmaster.js)
- [Earlier mission coordinator documentation](https://github.com/0x7n6/bitburner/blob/7190bfcb52fac12c16e598dddf2f8bef66c7202f/docs/MISSION_COORDINATION.md)
