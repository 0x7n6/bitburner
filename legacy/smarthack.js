/** @param {NS} ns */
export async function main(ns) {

    if (ns.args.length === 0) {
        ns.tprint("Usage: run smarthack.js TARGET");
        return;
    }

    const target = String(ns.args[0]);

    const minSecurity = ns.getServerMinSecurityLevel(target);
    const maxMoney = ns.getServerMaxMoney(target);

    const securityThreshold = minSecurity + 2;
    const moneyThreshold = maxMoney * 0.90;

    while (true) {
        if (ns.getServerSecurityLevel(target) > securityThreshold) {
            await ns.weaken(target);
        } else if (ns.getServerMoneyAvailable(target) < moneyThreshold) {
            await ns.grow(target);
        } else {
            await ns.hack(target);
        }
    }
}