import type { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
    const target = String(ns.args[0] ?? "");
    const finishAt = Number(ns.args[1] ?? 0);
    const actionTime = Number(ns.args[2] ?? 0);

    const batchId = String(ns.args[3] ?? "");
    const phase = String(ns.args[4] ?? "W");

    const port = Number(ns.args[5] ?? 20);
    const part = Number(ns.args[6] ?? 0);

    const additionalMsec = Math.max(
        0,
        finishAt - Date.now() - actionTime
    );

    const startedAt = Date.now();

    const value = await ns.weaken(target, {
        additionalMsec,
    });

    const finishedAt = Date.now();

    if (port >= 1 && port <= 20) {
        ns.tryWritePort(port, {
            version: 1,
            batchId,
            target,
            phase,
            part,
            pid: ns.pid,
            startedAt,
            scheduledFinish: finishAt,
            finishedAt,
            jitter: finishedAt - finishAt,
            value,
        });
    }
}