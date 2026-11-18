/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const target = String(ns.args[0]);
    const finishAt = Number(ns.args[1]);
    const plannedStart = Number(ns.args[2]);
    const tag = String(ns.args[3] ?? "");
    const tolerance = Math.max(0, Number(ns.args[4] ?? 100));

    const minSec = ns.getServerMinSecurityLevel(target);

    // We were spawned early. Prefer calling hack while security is clean.
    while (
        Date.now() < plannedStart &&
        ns.getServerSecurityLevel(target) > minSec + 0.001
    ) {
        await ns.sleep(5);
    }

    const baseTime = ns.getHackTime(target);

    const extra =
        finishAt -
        Date.now() -
        baseTime;

    if (extra < -tolerance) {
        ns.print(
            `[START-LATE] ${tag} by ${Math.abs(extra).toFixed(0)}ms`
        );
    }

    await ns.hack(
        target,
        {
            additionalMsec: Math.max(0, extra),
        }
    );

    const landingError =
        Date.now() -
        finishAt;

    if (Math.abs(landingError) > tolerance) {
        ns.print(
            `[LAND] ${tag} error=${landingError.toFixed(0)}ms`
        );
    }
}