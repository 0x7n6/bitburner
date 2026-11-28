import assert from "node:assert/strict";
import test from "node:test";

import { main as mission } from "../scripts/mission.ts";
import { main as study } from "../scripts/mission-study.ts";
import { main as stopfarm } from "../scripts/stopfarm.ts";

function fixture(flags = {}) {
    const state = {
        files: new Map([["bt4-plan.ts", ""], ["bootstrap.ts", ""]]),
        stock: true, node: 4, sf4: 0, nodeReset: 2, augReset: 3,
        maxRam: 128, used: 25, work: null, launched: [], killed: [], logs: [],
        ram: {
            "stopfarm.ts": 6, "bt4-auto.ts": 41.15, "mission-study.ts": 5,
            "share.ts": 4, "share-worker.ts": 4, "trader.ts": 32, "mission.ts": 4, "jit6.ts": 7,
        },
        processes: [], courses: [],
    };
    const ns = {
        pid: 20,
        disableLog: () => {},
        flags: () => ({ start: false, resume: false, minutes: 15, budget: 0, reserve: 0, _: [], ...flags }),
        getResetInfo: () => ({
            currentNode: state.node, ownedSF: new Map([[4, state.sf4]]),
            lastNodeReset: state.nodeReset, lastAugReset: state.augReset,
        }),
        getHostname: () => "home",
        getServer: () => ({ maxRam: state.maxRam, ramUsed: state.used }),
        getServerMaxRam: () => state.maxRam,
        getServerUsedRam: () => state.used,
        ui: { getGameInfo: () => ({ version: "3.0.1", commit: "3162fd2" }) },
        getScriptRam: file => state.ram[file] ?? 0,
        ps: () => state.processes,
        fileExists: file => state.files.has(file),
        read: file => state.files.get(file) ?? "",
        write: async (file, data) => { state.files.set(file, data); },
        rm: file => state.files.delete(file),
        scan: () => [],
        sleep: async () => {},
        tprint: message => state.logs.push(message),
        stock: { hasTixApiAccess: () => state.stock, has4SDataTixApi: () => state.stock },
        getPlayer: () => ({ city: "Sector-12" }),
        singularity: {
            getCurrentWork: () => state.work,
            universityCourse: (...args) => { state.courses.push(args); return true; },
        },
        exec: (...args) => { state.launched.push(args); return 30 + state.launched.length; },
        kill: pid => { state.killed.push(pid); return true; },
    };
    return { ns, state };
}

test("preview reports an observed engine and makes no launches", async () => {
    const { ns, state } = fixture();
    state.processes = [{ filename: "jit5.ts", pid: 146 }];
    await mission(ns);
    assert.ok(state.logs.some(log => log.includes("Engine: jit5.ts (PID 146)")));
    assert.deepEqual(state.launched, []);
});

test("low RAM starts one-shot free study, but refuses paid policy", async () => {
    for (const budget of [0, 1]) {
        const { ns, state } = fixture({ start: true, budget });
        state.maxRam = 32;
        state.used = 10;
        await mission(ns);
        assert.deepEqual(state.launched.map(entry => entry[0]), budget === 0 ? ["mission-study.ts"] : []);
    }
});

test("cold boot with locked Singularity reports manual player work", async () => {
    const { ns, state } = fixture({ start: true });
    state.node = 1;
    await mission(ns);
    assert.deepEqual(state.launched, []);
    assert.match(state.logs.at(-1), /Singularity is locked/);
});

test("another BitNode with Source-File 4 can admit the pilot", async () => {
    const { ns, state } = fixture({ start: true });
    state.node = 5;
    state.sf4 = 3;
    await mission(ns);
    assert.equal(state.launched[0][0], "bt4-auto.ts");
});

test("optional Share preserves its minimum headroom and stays off at 128 GB", async () => {
    for (const capacity of [128, 1024]) {
        const { ns, state } = fixture({ start: true, share: true });
        state.maxRam = capacity;
        await mission(ns);
        assert.deepEqual(state.launched.map(entry => entry[0]), capacity === 1024 ? ["bt4-auto.ts", "share.ts"] : ["bt4-auto.ts"]);
    }
});

test("optional Trader requires stock access and no conflicting purchase policy", async () => {
    for (const [stock, budget] of [[true, 0], [false, 0], [true, 1]]) {
        const { ns, state } = fixture({ start: true, trader: true, reserve: 200, budget });
        state.stock = stock;
        await mission(ns);
        const trader = state.launched.find(entry => entry[0] === "trader.ts");
        if (stock && budget === 0) {
            assert.deepEqual(trader.slice(3), ["--reserve-abs", 200, "--disable-shorts", "--mission-owned"]);
            assert.equal(state.files.has(".7n8-mission-trader-hold.txt"), true);
        } else {
            assert.equal(trader, undefined);
        }
    }
});

test("lightweight study starts at the local university and preserves active work", async () => {
    const { ns, state } = fixture();
    state.work = { type: "CLASS" };
    await study(ns);
    assert.deepEqual(state.courses, []);
    state.work = null;
    await study(ns);
    assert.deepEqual(state.courses, [["Rothman University", "Computer Science", false]]);
});

test("resuming uses only the remainder of the session and no financial services", async context => {
    context.mock.method(Date, "now", () => 120_000);
    const { ns, state } = fixture({ resume: true });
    state.files.set(".7n8-mission-work.txt", "4,2,3,600000");
    await mission(ns);
    assert.deepEqual(state.launched, [["bt4-auto.ts", "home", 1, "--execute",
        "--minutes", 8, "--reserve", 0, "--budget", 0]]);
    state.launched.length = 0;
    state.augReset++;
    await mission(ns);
    assert.deepEqual(state.launched, []);
    assert.match(state.logs.at(-1), /different reset/);
});

test("stp stops mission Trader only, holding positions and preserving resume policy", async () => {
    const { ns, state } = fixture();
    state.files.set(".7n8-mission-work.txt", "4,2,3,600000");
    state.processes = [
        { filename: "trader.ts", pid: 10, args: [] },
        { filename: "trader.ts", pid: 11, args: ["--mission-owned"] },
        { filename: "mission-study.ts", pid: 12, args: [] },
    ];
    await stopfarm(ns);
    assert.deepEqual(state.killed, [11, 12]);
    assert.equal(state.files.has(".7n8-mission-work.txt"), true);
    assert.equal(state.files.has(".7n8-pause.txt"), true);
});

test("stp-rs starts only JIT6 after a legacy supervisor stops", async () => {
    const { ns, state } = fixture({ resume: true });
    state.processes = [{ filename: "daemon.ts", pid: 1, args: [] }];
    state.files.set(".7n8-mission-work.txt", "4,2,3,600000");
    state.files.set(".7n8-pause.txt", "1");
    await stopfarm(ns);
    assert.deepEqual(state.launched, []);
    assert.equal(state.files.has(".7n8-pause.txt"), true);
    state.processes = [];
    await stopfarm(ns);
    assert.deepEqual(state.launched, [["jit6.ts", "home", { threads: 1, preventDuplicates: true }, "--execute"]]);
    assert.equal(state.files.has(".7n8-pause.txt"), false);
    state.processes = [{ filename: "jit6.ts", pid: 31, args: ["--execute"] }];
    await stopfarm(ns);
    assert.equal(state.launched.length, 1);
});

test("stp-rs preserves the pause when JIT6 cannot be launched", async () => {
    const { ns, state } = fixture({ resume: true });
    state.files.set(".7n8-pause.txt", "original pause");
    state.ram["jit6.ts"] = 0;
    await stopfarm(ns);
    assert.deepEqual(state.launched, []);
    assert.equal(state.files.get(".7n8-pause.txt"), "original pause");
    state.ram["jit6.ts"] = 7;
    ns.exec = () => 0;
    await stopfarm(ns);
    assert.equal(state.files.get(".7n8-pause.txt"), "original pause");
});

test("stopfarm rejects remote execution and conflicting lifecycle flags before changing state", async () => {
    const { ns, state } = fixture({ os: true, resume: true });
    ns.getHostname = () => "remote-worker";
    await stopfarm(ns);
    assert.match(state.logs.at(-1), /on home/);
    ns.getHostname = () => "home";
    await stopfarm(ns);
    assert.match(state.logs.at(-1), /either --resume or --os/);
    assert.equal(state.files.has(".7n8-pause.txt"), false);
    assert.deepEqual(state.killed, []);
    assert.deepEqual(state.launched, []);
});
