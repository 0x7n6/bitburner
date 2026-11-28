import assert from "node:assert/strict";
import test from "node:test";

import { main as schedule, planAdmission } from "../scripts/jit6.ts";
import { main as upgradeHome } from "../scripts/jit6-home.ts";
import { observeProgression } from "../scripts/bt4-plan.ts";
import { main as stopfarm } from "../scripts/stopfarm.ts";

function snapshot(overrides = {}) {
    return {
        homeRam: 128, free: 80, emergency: 6, paused: false, available: true,
        remainingMs: 60_000, costs: { "bt4-auto.ts": 41.15, "mission-study.ts": 5, "jit6-home.ts": 8 },
        ...overrides,
    };
}

test("planner prioritizes bounded upgrade, then fits work inside measured RAM", () => {
    assert.equal(planAdmission(snapshot(), 256, false).job, "jit6-home.ts");
    assert.equal(planAdmission(snapshot(), 256, true).job, "bt4-auto.ts");
    assert.equal(planAdmission(snapshot({ free: 17 }), 0, false).job, "mission-study.ts");
    assert.equal(planAdmission(snapshot({ free: 10 }), 0, false).job, null);
    assert.equal(planAdmission(snapshot(), 200, false).job, "bt4-auto.ts");
});

test("planner rejects paused, locked, expired or externally owned work and honors capital ownership", () => {
    for (const state of [{ paused: true }, { available: false }, { remainingMs: 0 }, { emergency: 0 },
        { workOwner: "progression.ts" }]) {
        assert.equal(planAdmission(snapshot(state), 256, false).job, null);
    }
    assert.equal(planAdmission(snapshot({ capitalOwner: "trader.ts" }), 256, false).job, "bt4-auto.ts");
});

function fixture(context, flags = {}) {
    const state = {
        now: 1_000, processes: [], cash: 1000, price: 200, max: 128, used: 32,
        node: 4, augReset: 3, locked: false, upgrades: 0, launches: [], killed: [], logs: [],
        nextPid: 500, failExec: false, onSleep: () => {}, exit: () => {},
        files: new Set(["bt4-plan.ts"]),
    };
    context.mock.method(Date, "now", () => state.now);
    const costs = { "bt4-auto.ts": 41.15, "mission-study.ts": 5, "jit6-home.ts": 8, "stopfarm.ts": 6 };
    const ns = {
        pid: 20, args: [], disableLog: () => {},
        flags: () => ({ execute: true, minutes: 1, "home-target": 0, "home-cap": 0, reserve: 0, _: [], ...flags }),
        getHostname: () => "home",
        ui: { getGameInfo: () => ({ version: "3.0.1", commit: "3162fd2" }) },
        getResetInfo: () => ({
            currentNode: state.node, ownedSF: new Map(), lastNodeReset: 2, lastAugReset: state.augReset,
            bitNodeOptions: { restrictHomePCUpgrade: state.locked },
        }),
        getServerMaxRam: () => state.max,
        getServerUsedRam: () => state.used,
        getScriptRam: name => costs[name],
        getPlayer: () => ({ money: state.cash }),
        fileExists: file => state.files.has(file),
        write: async file => { state.files.add(file); },
        rm: file => state.files.delete(file),
        scan: () => [],
        ps: () => state.processes,
        tprint: line => state.logs.push(line),
        atExit: callback => { state.exit = callback; },
        kill: pid => { state.killed.push(pid); return true; },
        sleep: async time => { state.now += time; state.onSleep(); },
        exec: (name, host, options, ...args) => {
            state.launches.push({ name, host, options, args });
            if (state.failExec) return 0;
            const pid = state.nextPid++;
            state.processes.push({ filename: name, pid, args });
            return pid;
        },
        singularity: {
            getUpgradeHomeRamCost: () => state.price,
            upgradeHomeRam: () => {
                state.upgrades++;
                state.cash -= state.price;
                state.max *= 2;
                return true;
            },
        },
    };
    return { ns, state };
}

test("preview remains read-only even with upgrade flags", async context => {
    const { ns, state } = fixture(context, { execute: false, "home-target": 256, "home-cap": 300 });
    await schedule(ns);
    assert.deepEqual(state.launches, []);
    assert.match(state.logs.at(-1), /Next: jit6-home/);
});

test("waits until RAM frees, then launches full work against the original deadline", async context => {
    const { ns, state } = fixture(context);
    state.used = 119;
    state.onSleep = () => {
        if (state.launches.length) state.processes = [];
        else state.used = 30;
    };
    await schedule(ns);
    assert.equal(state.launches.length, 1);
    assert.deepEqual(state.launches[0].args, ["--execute", "--minutes", 1, "--deadline", 61000, "--wait-idle",
        "--reserve", 0, "--budget", 0]);
    assert.match(state.logs[0], /No ready tool fits/);
});

test("one authorized upgrade is attempted before work, without repeating on refusal", async context => {
    const { ns, state } = fixture(context, { "home-target": 256, "home-cap": 300, reserve: 500 });
    state.onSleep = () => { state.processes = []; };
    await schedule(ns);
    assert.deepEqual(state.launches.map(job => job.name), ["jit6-home.ts", "bt4-auto.ts"]);
    assert.deepEqual(state.launches[0].args.slice(0, 3), [300, 500, 256]);
    assert.match(state.logs.find(log => log.includes("Upgrade attempt ended")), /128 → 128 GB/);
});

test("failed process launches retry at most three times", async context => {
    const { ns, state } = fixture(context);
    state.failExec = true;
    await schedule(ns);
    assert.equal(state.launches.length, 3);
    assert.match(state.logs.at(-1), /3\/3/);
});

test("pause shuts down only a child PID launched by this session", async context => {
    const { ns, state } = fixture(context);
    state.processes = [{ filename: "jit5.ts", pid: 146, args: [] }];
    state.onSleep = () => { state.files.add(".7n8-pause.txt"); };
    await schedule(ns);
    state.exit();
    assert.deepEqual(state.killed, [500]);
});

test("home upgrade rejects stale, repriced or competing authorization and respects cash floor", async context => {
    const { ns, state } = fixture(context);
    ns.args = [300, 750, 256, 61_000, 4, 2, 3];
    state.price = 310;
    await upgradeHome(ns);
    assert.equal(state.upgrades, 0);
    state.price = 260;
    await upgradeHome(ns);
    assert.equal(state.upgrades, 0);
    state.price = 200;
    state.processes = [{ filename: "trader.ts", pid: 146, args: [] }];
    await upgradeHome(ns);
    assert.equal(state.upgrades, 0);
    state.processes = [];
    state.augReset = 4;
    await upgradeHome(ns);
    assert.equal(state.upgrades, 0);
    state.augReset = 3;
    await upgradeHome(ns);
    assert.equal(state.upgrades, 1);
    assert.equal(state.cash, 800);
    assert.equal(state.max, 256);
    await upgradeHome(ns);
    assert.equal(state.upgrades, 1);
});

test("support-only resume leaves pause set with a running supervisor, then unpauses without launching a process", async context => {
    const { ns, state } = fixture(context, { resume: true, "support-only": true });
    state.files.add(".7n8-pause.txt");
    state.processes = [{ filename: "daemon.ts", pid: 2, args: [] }];
    await stopfarm(ns);
    assert.equal(state.files.has(".7n8-pause.txt"), true);
    state.processes = [];
    await stopfarm(ns);
    assert.equal(state.files.has(".7n8-pause.txt"), false);
    assert.deepEqual(state.launches, []);
});

test("BT4 retains prerequisite chains for reachable useful goals only", () => {
    const boosts = new Set(["Helpful", "Inaccessible", "Cyclic"]);
    const prerequisites = {
        NeutralV2: ["NeutralV1"],
        Helpful: ["Step2"], Step2: ["Step1"],
        Inaccessible: ["Missing", "StepUnused"],
        Cyclic: ["CycleStep"], CycleStep: ["Cyclic"],
    };
    const names = ["NeutralV1", "NeutralV2", "Helpful", "Step1", "Step2", "StepUnused", "Inaccessible", "Cyclic", "CycleStep"];
    const ns = {
        getPlayer: () => ({ money: 100, city: "Sector-12", factions: ["Mock faction"] }),
        singularity: {
            getOwnedAugmentations: () => [],
            getFactionRep: () => 20,
            getFactionWorkTypes: () => ["field"],
            getAugmentationsFromFaction: () => names,
            getAugmentationRepReq: () => 0,
            getAugmentationStats: name => boosts.has(name) ? { hacking_exp: 1.1 } : {},
            getAugmentationPrice: () => 1,
            getAugmentationPrereq: name => prerequisites[name] ?? [],
        },
    };
    const plan = observeProgression(ns, 4, 0);
    assert.deepEqual(plan.ready.filter(candidate => candidate.useful).map(candidate => candidate.name), ["Step1"]);
    assert.equal(plan.ready.find(candidate => candidate.name === "NeutralV1").useful, false);
});
