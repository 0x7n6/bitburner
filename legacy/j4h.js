/** @param {NS} ns */
export async function main(ns) {
    const target = String(ns.args[0]);
    const finishAt = Number(ns.args[1]);
    const actionTime = Number(ns.args[2]);

    const extra = Math.max(
        0,
        finishAt - Date.now() - actionTime
    );

    await ns.hack(target, {
        additionalMsec: extra,
    });
}