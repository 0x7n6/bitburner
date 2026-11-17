/** @param {NS} ns */
export async function main(ns) {
    const target = String(ns.args[0]);

    if (!target) {
        ns.tprint("Usage: run hack-once.js [-t THREADS] TARGET");
        return;
    }

    const before = ns.getServerMoneyAvailable(target);

    const stolen = await ns.hack(target);

    const after = ns.getServerMoneyAvailable(target);

    ns.tprint(
        `${target}: stole $${ns.format.number(stolen)} | ` +
        `$${ns.format.number(before)} -> $${ns.format.number(after)}`
    );
}