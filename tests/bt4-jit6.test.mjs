import assert from "node:assert/strict";
import test from "node:test";

import { main as schedule, planAdmission } from "../scripts/jit6.ts";
import { main as upgradeHome } from "../scripts/jit6-home.ts";
import { observeProgression } from "../scripts/bt4-plan.ts";
import { main as stopfarm } from "../scripts/stopfarm.ts";
import { main as share } from "../scripts/share.ts";

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
    assert.equal(planAdmission(snapshot({ free: 17 }), 0, false, 100).job, null);
});

test("planner rejects paused, locked, expired or externally owned work and honors capital ownership", () => {
    for (const state of [{ paused: true }, { available: false }, { remainingMs: 0 }, { emergency: 0 },
        { workOwner: "progression.ts" }]) {
        assert.equal(planAdmission(snapshot(state), 256, false).job, null);
    }
    assert.equal(planAdmission(snapshot({ capitalOwner: "trader.ts" }), 256, false).job, "bt4-auto.ts");
    assert.equal(planAdmission(snapshot({ capitalOwner: "trader.ts" }), 0, false, 100).job, null);
});

function fixture(context, flags = {}) {
    const state = {
        now: 1_000, processes: [], cash: 1000, price: 200, max: 128, used: 32, modelRam: false,
        node: 4, augReset: 3, locked: false, stock: true, upgrades: 0, launches: [], killed: [], logs: [],
        nextPid: 500, failExec: false, onSleep: () => {}, exit: () => {},
        files: new Set(["bt4-plan.ts"]),
    };
    context.mock.method(Date, "now", () => state.now);
    const costs = { "bt4-auto.ts": 41.15, "mission-study.ts": 5, "jit6-home.ts": 8, "stopfarm.ts": 6,
        "share.ts": 4, "share-worker.ts": 4, "trader.ts": 32, "ap.ts": 9, "jit6-dashboard.ts": 4 };
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
        getServerUsedRam: () => state.used + (state.modelRam
            ? state.processes.reduce((sum, process) => sum + (costs[process.filename] ?? 0) * (process.threads ?? 1), 0)
            : 0),
        getScriptRam: name => costs[name] ?? 0,
        getPlayer: () => ({ money: state.cash }),
        fileExists: file => state.files.has(file),
        read: () => "",
        write: async file => { state.files.add(file); },
        rm: file => state.files.delete(file),
        scan: () => [],
        ps: () => state.processes,
        tprint: line => state.logs.push(line),
        print: () => {},
        atExit: callback => { state.exit = callback; },
        kill: pid => { state.killed.push(pid); return true; },
        sleep: async time => { state.now += time; state.onSleep(); },
        exec: (name, host, options, ...args) => {
            state.launches.push({ name, host, options, args });
            if (state.failExec) return 0;
            const pid = state.nextPid++;
            state.processes.push({ filename: name, pid, args, threads: typeof options === "number" ? options : options.threads });
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
        stock: { hasTixApiAccess: () => state.stock, has4SDataTixApi: () => state.stock },
    };
    return { ns, state };
}

test("preview remains read-only even with upgrade flags", async context => {
    const { ns, state } = fixture(context, { execute: false, "home-target": 256, "home-cap": 300 });
    await schedule(ns);
    assert.deepEqual(state.launches, []);
    assert.match(state.logs.at(-1), /Next: jit6-home/);
});

test("preview and execution both report a competing supervisor", async context => {
    const flags = { execute: false };
    const { ns, state } = fixture(context, flags);
    state.processes = [{ filename: "jit6.ts", pid: 21, args: ["--execute"] }];
    await schedule(ns);
    assert.match(state.logs.at(-1), /Next: wait \| Another supervisor is active: jit6\.ts/);

    flags.execute = true;
    await schedule(ns);
    assert.match(state.logs.at(-1), /Another supervisor is active: jit6\.ts/);
    assert.deepEqual(state.launches, []);
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
    assert.deepEqual(state.launches[0].args, ["--execute", "--minutes", 1, "--deadline", 61000, "--replace-study",
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

test("JIT6 carries an authorized augmentation budget and refuses to mix it with trading", async context => {
    const { ns, state } = fixture(context, { "augment-cap": 100, reserve: 700 });
    await schedule(ns);
    assert.deepEqual(state.launches[0].args.slice(-4), ["--reserve", 700, "--budget", 100]);
    const flags = ns.flags();
    ns.flags = () => ({ ...flags, trader: true });
    await schedule(ns);
    assert.equal(state.launches.length, 1);
    assert.match(state.logs.at(-1), /without purchase budgets/);
});

test("Trader can run in BN8 with Singularity locked and only a new launch can rearm it", async context => {
    const { ns, state } = fixture(context, { trader: true, reserve: 750 });
    state.node = 8;
    state.files.add(".7n8-trader-disabled.txt");
    ns.read = () => "operator marker at start";
    await schedule(ns);
    assert.deepEqual(state.launches.map(launch => launch.name), ["trader.ts"]);
    assert.deepEqual(state.launches[0].args, ["--reserve-abs", 750, "--disable-shorts", "--mission-owned"]);
    assert.equal(state.files.has(".7n8-mission-trader-hold.txt"), true);
    assert.equal(state.files.has(".7n8-trader-disabled.txt"), false);
    state.exit();
    assert.deepEqual(state.killed, [500]);
});

test("optional services wait when stock access or Share headroom is absent", async context => {
    const { ns, state } = fixture(context, { share: true, trader: true, reserve: 750 });
    state.stock = false;
    state.used = 74;
    state.modelRam = true;
    await schedule(ns);
    assert.deepEqual(state.launches.map(launch => launch.name), ["bt4-auto.ts"]);
    assert.ok(state.logs.some(log => log.includes("TIX and 4S TIX access")));
    assert.ok(state.logs.some(log => log.includes("51.00 GB of control headroom")));
    assert.equal(state.files.has(".7n8-mission-trader-hold.txt"), false);
});

test("Share can start at 128 GB when work and control headroom fit", async context => {
    const { ns, state } = fixture(context, { share: true });
    state.modelRam = true;
    await schedule(ns);
    assert.deepEqual(state.launches.map(launch => launch.name), ["bt4-auto.ts", "share.ts"]);
    assert.deepEqual(state.launches[1].args, ["--reserve", 19, "--owner", 20]);
});

test("Trader respects a hold placed while JIT6 was preparing to launch", async context => {
    const { ns, state } = fixture(context, { trader: true, reserve: 750 });
    state.onSleep = () => { state.files.add(".7n8-trader-disabled.txt"); };
    await schedule(ns);
    assert.deepEqual(state.launches.map(launch => launch.name), ["bt4-auto.ts"]);
    assert.match(state.logs.find(log => log.includes("disabled during")), /Trader was disabled during this session/);
});

test("JIT6 stops both services and work it launched when the reset generation changes", async context => {
    const { ns, state } = fixture(context, { share: true, trader: true, reserve: 750 });
    state.max = 1024;
    state.onSleep = () => { if (state.launches.length === 3) state.augReset++; };
    await schedule(ns);
    assert.deepEqual(state.launches.map(launch => launch.name), ["bt4-auto.ts", "trader.ts", "share.ts"]);
    assert.deepEqual(state.launches[2].args, ["--reserve", 19, "--owner", 20]);
    assert.match(state.logs.at(-1), /Reset changed/);
    state.exit();
    assert.deepEqual(state.killed, [501, 502, 500]);
});

test("managed Share owns only the worker from its own launch", async context => {
    const { ns, state } = fixture(context, { owner: 1, reserve: 19 });
    state.used = 100;
    state.files.add("share-worker.ts");
    state.processes = [{ filename: "jit6.ts", pid: 1, args: ["--execute"] }];
    ns.getSharePower = () => 1;
    state.onSleep = () => { state.processes = [{ filename: "share-worker.ts", pid: 501, threads: 1 }]; };
    await share(ns);
    state.exit();
    assert.deepEqual(state.launches.map(launch => launch.name), ["share-worker.ts"]);
    assert.equal(state.launches[0].options.threads, 2);
    assert.deepEqual(state.killed, [500]);
});

test("managed Share releases headroom when demand rises by fewer than 32 threads", async context => {
    const { ns, state } = fixture(context, { owner: 1, reserve: 19 });
    state.used = 93;
    state.modelRam = true;
    state.files.add("share-worker.ts");
    state.processes = [{ filename: "jit6.ts", pid: 1, args: ["--execute"] }];
    ns.getSharePower = () => 1;
    ns.kill = pid => {
        state.killed.push(pid);
        state.processes = state.processes.filter(process => process.pid !== pid);
        return true;
    };
    state.onSleep = () => {
        if (state.launches.length === 1) state.used = 104;
        else state.processes = [];
    };
    await share(ns);
    assert.deepEqual(state.launches.map(launch => launch.options.threads), [4, 1]);
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
