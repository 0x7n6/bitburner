# BT4 alpha1 — read-only mission observation

Status: implemented candidate; static and mocked validation only. Game runtime acceptance pending.
Baseline: af45c0a69d90d0a45b1756148bcd5262b833a8d1. Official API: v3.0.1,
3162fd2590e221eadd0c0fbd46151913f7c4c41c. User confirmed BN4.1 on this version.

## Scope and lifecycle

`bt4.ts` is a one-shot basic snapshot. `bt4-detail.ts` adds Singularity observations
and imports `bt4.ts`. Both exit after printing; neither supervises, persists state,
spends money, starts workers, changes work, roots hosts, touches ports, nor resets.
`--dry-run` explicitly selects the same observation behavior as normal execution.
`--json` prints compact JSON (basic also prints a completion message).
AP's new **BN4 mission** menu exposes both. Universal launcher calls use
the same BT4 admission checks. Existing production and daemon behavior are unchanged.

Basic output: actual game version, reset timestamps, active Source-Files, installed
augmentation map, player skills/XP/multipliers, home resources, stopfarm RAM cost,
program inventory, reachable network and process inventory, production PID/arguments,
policy versus daemon status, and World Daemon hacking threshold if visible.
Process presence is explicitly not a health or income measurement. Network RAM is
not scheduler capacity. Missing API observations remain UNKNOWN. A hidden World
Daemon is UNKNOWN, not an assumed 9000 requirement.

Detail adds current work, installed/purchased/queued augmentation lists, membership,
faction reputation/favor, offered augmentation prices/rep/prerequisites, and live
Daedalus invitation requirements with deterministic MET/UNMET/UNKNOWN results.
Queued repeated NeuroFlux entries are retained using multiset subtraction. Only
installed entries count toward installed-augmentation requirements. Unknown condition
types are not interpreted as satisfied. Recommendations are review suggestions,
not player-action automation. No aggregate mission-completion percentage is emitted.

## Deliberate observation gaps

`checkFactionInvitations()` is NOT read-only in this version: official Singularity
source resets the invitation counter and invokes Engine.checkCounters. It is omitted.
Inspect invitations manually in the game UI. Protected capital, pending automation,
and production health remain UNKNOWN because there is no established shared contract.
The snapshot is sequential, not atomic; other running scripts and game ticks can
change values during collection. Basic records partial network failure explicitly.
Detail errors are field-local. No fixed low-RAM compatibility promise is made.

## RAM and admission

AP measures script cost via getScriptRam and refuses admission unless free RAM minus
observer cost remains at least the measured stopfarm.ts cost. Missing/invalid
stopfarm.ts blocks admission. Detail requires Singularity and the basic dependency;
an already running observation blocks a second AP observation. Runtime script costs
must be measured in-game, especially outside BN4 (SF4 costs scale by 16/4/1).
AP itself is already included in used RAM at admission. The reserve is a headroom
check, not a reservation against concurrent allocators; existing production can
consume RAM after the check. Direct terminal launches bypass AP admission: use AP
for the acceptance run. Current JIT5 resource policy is not altered by this patch.

## Source research

- Official [API definitions](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/ScriptEditor/NetscriptDefinitions.d.ts): signatures, ResetInfo maps, requirements and game info.
- Official [Singularity](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/NetscriptFunctions/Singularity.ts): access, installed versus queued lists, read getters, invitation side effects.
- Official [RAM cost generator](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Netscript/RamCostGenerator.ts): SF4 scaling, static API cost distinction.
- Official [faction requirements](https://github.com/bitburner-official/bitburner-src/blob/3162fd2590e221eadd0c0fbd46151913f7c4c41c/src/Faction/FactionInfo.tsx): Daedalus requires installed augmentations, cash and hacking OR all combat skills; runtime requirement tree is used instead of copied thresholds.
- Imported `sources/alainbryden/work-for-factions.js`, startup and getter helpers:
  separate installed/purchased/work/faction observations are useful; its temporary
  file/dynamic execution approach was not adopted for this strictly observing path.
- Imported `sources/Yuriyli/src/modules/classes/ServerInfo.ts` and `homeServerInfo.ts`:
  distinguish free RAM from integer worker capacity. BT4 reports observed resources,
  without claiming placement feasibility or copying its launch methods.
- Imported `sources/chrisrabe/_stable/queue-service.js`: persistent port queue and
  clearing behavior are unsuitable here. BT4 has no port ownership or persistent IPC.
- Imported source manifest lacks commit/license metadata for those three sources;
  no third-party code was copied. `sources/mediocretes/LICENSE` is MIT, but no code
  from that implementation was adopted. Root LICENSE is MIT while package metadata
  says ISC; that existing inconsistency is outside this patch.

## Runtime acceptance — operator must execute and retain evidence

1. Stop the local filesync watcher before patch application. The patcher does not
   control or detect every sync process. It runs baseline and post-change typechecks
   and backs up under backups/. Review the printed diff. No commit/push is performed.
2. Start the configured `npm run sync` and confirm all THREE changed runtime files
   (`ap.ts`, `bt4.ts`, `bt4-detail.ts`) reach home. `pushAllOnConnection:false` means
   connection success alone is insufficient. Use the sync tool's supported explicit
   push/reload workflow if needed; do not assume untouched files were sent.
3. Record `home`, `ps`, `free`, `mem ap.ts`, `mem bt4.ts`, `mem bt4-detail.ts`,
   `mem stopfarm.ts`. Record current manual work, engine PID/args, pause/policy,
   installed/queued counts, factions and game version from UI. Close any old AP
   instance so the next launch uses the updated source; leave JIT5 running.
4. Run `run ap.ts`; choose BN4 mission > Basic snapshot. Expect the actual
   standalone JIT5 PID/args, daemon OFFLINE when absent, policy separate from daemon,
   reserve status and network inventory. Check that all output parses and exits.
5. Choose BN4 mission > Singularity detail. Expect current manual work to
   remain unchanged; compare installed/queued lists and faction values with UI.
   Daedalus recommendations must match the printed live requirement tree. No invitation
   trigger, join, purchase, install, root, worker launch or port drain is expected.
6. Compare before/after processes, manual work, pause/policy, files and production
   logs. Observer/AP processes are expected; no new production processes are expected.
   Money, XP, reputation and worker PIDs can naturally change while production runs:
   differences alone are not proof of observer mutation. For strict state comparison,
   use a controlled disposable save/window; do not kill production solely for this test.
7. In a controlled 32 GB configuration, measure costs and test basic admission with
   sufficient reserve, plus detail refusal when insufficient. Test missing stopfarm
   and locked Singularity in a disposable environment. Expect refusal/UNKNOWN, never
   termination of another process. Mock tests do not establish cold-boot compatibility.
8. Retain output, version, patch hashes, mem values and results. Runtime status stays
   PENDING until supplied evidence confirms these scenarios. No throughput improvement
   is claimed. JIT5 prep duplication and allocator failures remain separate P0 tasks.

## Rollback

The alpha1 patcher rollback applies only to its exact original payload. For
the assisted progression release, use its Git revision history and redeploy
the applicable source files.

Stop filesync. Run the patcher's --rollback with the exact backup directory printed
at apply time and --sync-stopped. It verifies current patched hashes and backup
contents before restoring AP and deleting only its two new scripts and this document.
It refuses to overwrite later edits. Post-rollback typecheck runs and evidence is
printed. Sync restored AP explicitly. Because allowDeletingFiles=false, restored
local state does not remove BT4 from the game: after observers exit, manually remove
`bt4.ts` and `bt4-detail.ts` from game home if reverting the deployment. Do not remove
unrelated files. No production restart is required for this observation-only change.
