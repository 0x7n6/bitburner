import type { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
    const target =
        String(ns.args[0] ?? "");

    const finishAt =
        Number(ns.args[1] ?? 0);

    // args[2] is the planner's original actionTime.
    // JIT5 deliberately recomputes the live value instead.

    const batchId =
        String(ns.args[3] ?? "");

    const phase =
        String(ns.args[4] ?? "W");

    const port =
        Number(ns.args[5] ?? 20);

    const part =
        Number(ns.args[6] ?? 0);

    /*
     * Re-read action duration NOW.
     *
     * Hacking level / server state may have changed
     * since the controller planned this batch.
     */
    const now =
        Date.now();

    const baseTime =
        ns.getWeakenTime(target);

    const plannedStart =
        finishAt -
        baseTime;

    const lateBy =
        Math.max(
            0,
            now -
            plannedStart
        );

    const additionalMsec =
        Math.max(
            0,
            finishAt -
            now -
            baseTime
        );

    const startedAt =
        Date.now();

    const value =
        await ns.weaken(
            target,
            {
                additionalMsec,
            }
        );

    const finishedAt =
        Date.now();

    if (
        port >= 1 &&
        port <= 20
    ) {
        ns.tryWritePort(
            port,
            {
                version: 2,

                batchId,
                target,
                phase,
                part,

                pid:
                    ns.pid,

                startedAt,

                scheduledFinish:
                    finishAt,

                finishedAt,

                jitter:
                    finishedAt -
                    finishAt,

                baseTime,
                lateBy,

                value,
            }
        );
    }
}
