/** @param {NS} ns */
export async function main(ns) {
    const target = String(ns.args[0]);
    const extra = Math.max(0, Number(ns.args[1] ?? 0));

    await ns.weaken(target, {
        additionalMsec: extra,
    });
}