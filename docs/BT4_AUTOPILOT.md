# BN4 Singularity autopilot

BT4 follows the bounded authorization model in Operation Singularity R3
sections 27–29 and 36. It runs on home in BN4 with Bitburner v3.0.1
(3162fd2). AP measures the pilot's RAM cost and keeps enough free RAM for
`stopfarm.ts` when launching. The pilot rechecks headroom on each decision.

## Run a session

1. Sync AP, stopfarm, and the BT4 files from the runtime release on main.
   Reopen AP to load the new menu. Measure `mem bt4-auto.ts` and
   `mem stopfarm.ts` before launch.
2. Open **BN4 mission → Preview autopilot** and enter the cash floor and
   session purchase budget. Preview prints the next proposed actions.
3. Start with **Start autopilot**, a one-minute session, and a budget of
   zero to test work ownership and emergency headroom. If player work is
   already active, end it from the game UI first if you want BT4 to take over.
4. To authorize purchases, enter the maximum total for that session and
   the balance you want to keep. The pilot re-reads live prices and
   prerequisites after each purchase and queues up to eight augmentations
   per session. The cash floor and spending cap limit its own purchases.
5. Use **Stop autopilot** in AP to stop the controller. Any existing
   player work continues. Use the game UI when you also want to end work.

Terminal preview and a one-minute work-only session:

```text
run bt4-auto.ts --reserve 0
run bt4-auto.ts --reserve 0 --budget 0 --minutes 1 --execute
```

Each session lasts 1–120 minutes. The controller checks in five-second
intervals and manages only work it started in that session. It chooses a
faction reputation target with an affordable useful augmentation. If
there is no such target, it can start free Computer Science in Aevum,
Sector-12, or Volhaven. Manual changes or cancellation end the session
on the next check. Pausing the OS stops the controller. A new session
requires a fresh opt-in. Reset, augmentation installation, BitNode
transition, and faction membership remain operator decisions.

## Acceptance checklist

| Test in game | Expected observation |
| --- | --- |
| Preview with an existing Heist | Report prints and player work continues |
| Start while Heist is active | Controller exits without taking over |
| Start idle with budget zero | Eligible faction work or local free study starts |
| Manually restart the same work | Controller recognizes the new session and exits |
| Approved budget above the floor | Each upgrade joins the augmentation queue within the cumulative cap |
| Concurrent capital service on home | Augmentation purchases wait |
| Stop from AP or pause with stopfarm | Controller exits and existing player work continues |
| Session deadline | Controller exits and prints a purchase summary |

Use a disposable test save for purchases or pressure tests. Record AP
output, game version, measured RAM, before/after cash, and augmentation
queue. Real game execution and RAM measurements are pending.

## Implementation reference

The free class is defined without a money cost. Each player work object
exposes its own stable completion promise while active. BT4 uses the
promise to retain ownership of a specific work session, including when
the operator manually starts identical work. Verified for the pinned
official game release.

- [Free Computer Science and class status](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Work/ClassWork.tsx)
- [Completion promise identity](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Work/Work.ts)
- [Faction work status](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Work/FactionWork.tsx)
