import assert from "node:assert/strict";
import test from "node:test";

import { main } from "../scripts/bt4-auto.ts";

const token = () => new Promise(() => {});

function fixture(options = {}) {
    const state = {
        cash: 1_000, prices: { Alpha: 200, Beta: 200 }, rep: 50,
        work: null, purchases: [], events: [], logs: [], offers: ["Alpha", "Beta"],
        processes: [], paused: false, ticks: 0, version: "3.0.1",
        generation: 10, node: 4, spare: 20, hasFormulas: false, maxTicks: 4, onTick: undefined,
    };
    const ns = {
        pid: 20, getHostname: () => "home", disableLog: () => {},
        ui: { getGameInfo: () => ({ version: state.version, commit: "3162fd2" }) },
        flags: () => ({ execute: true, reserve: 600, budget: 0, minutes: 1, _: [], ...options }),
        tprint: message => state.logs.push(message), print: () => {},
        getResetInfo: () => ({ currentNode: state.node, ownedSF: new Map([[4, 1]]), lastNodeReset: 1, lastAugReset: state.generation }),
        fileExists: file => file === "Formulas.exe" ? state.hasFormulas : state.paused,
        getScriptRam: () => 5,
        getServerMaxRam: () => 128,
        getServerUsedRam: () => 128 - state.spare,
        getPlayer: () => ({ money: state.cash, city: "Sector-12", factions: ["CyberSec"] }),
        ps: () => state.processes,
        sleep: async () => {
            state.ticks++;
            state.onTick?.(state.ticks);
            if (state.ticks >= state.maxTicks) state.paused = true;
        },
        singularity: {
            getCurrentWork: () => state.work,
            getOwnedAugmentations: purchased => purchased ? state.purchases : [],
            getFactionRep: () => state.rep,
            getFactionWorkTypes: () => ["hacking"],
            getAugmentationsFromFaction: () => state.offers,
            getAugmentationStats: () => ({ hacking_exp: 1.25 }),
            getAugmentationRepReq: () => 100,
            getAugmentationPrereq: () => [],
            getAugmentationPrice: name => state.prices[name],
            workForFaction: (factionName, factionWorkType, focus) => {
                state.events.push(["work", factionName, factionWorkType, focus]);
                state.work = { type: "FACTION", factionName, factionWorkType, nextCompletion: token() };
                return true;
            },
            universityCourse: (location, classType, focus) => {
                state.events.push(["study", location, classType, focus]);
                state.work = { type: "CLASS", classType, location, nextCompletion: token() };
                return true;
            },
            purchaseAugmentation: (_faction, name) => {
                state.events.push(["purchase", name]);
                state.cash -= state.prices[name];
                state.purchases.push(name);
                return true;
            },
        },
    };
    return { ns, state };
}

test("preview reports eligible actions without acting", async () => {
    const { ns, state } = fixture({ execute: false, budget: 300 });
    state.rep = 100;
    await main(ns);
    assert.match(state.logs[0], /"purchase":\{"name":"Alpha"/);
    assert.deepEqual(state.events, []);
});

test("existing player work is preserved", async () => {
    const { ns, state } = fixture();
    state.work = { type: "CRIME", nextCompletion: token() };
    await main(ns);
    assert.match(state.logs[0], /externally owned/);
    assert.deepEqual(state.events, []);
});

test("an explicit JIT6 budget can queue purchases while manual work continues", async () => {
    const { ns, state } = fixture({ budget: 300, "wait-idle": true });
    state.rep = 100;
    const manual = { type: "CLASS", nextCompletion: token() };
    state.work = manual;
    await main(ns);
    assert.deepEqual(state.events, [["purchase", "Alpha"]]);
    assert.equal(state.work, manual);
});

test("the standard Red Pill route is prioritized on other BitNodes and omitted in BN15", async () => {
    const { ns, state } = fixture({ execute: false, budget: 300 });
    state.rep = 100;
    state.node = 12;
    state.offers = ["Alpha", "The Red Pill"];
    state.prices["The Red Pill"] = 1;
    ns.singularity.getAugmentationStats = name => name === "Alpha" ? { hacking_exp: 1.25 } : {};
    await main(ns);
    assert.match(state.logs.at(-1), /"purchase":\{"name":"The Red Pill"/);
    state.node = 15;
    await main(ns);
    assert.match(state.logs.at(-1), /"purchase":\{"name":"Alpha"/);
});

test("live faction formulas choose the faster seller and work type for the same augmentation", async () => {
    const { ns, state } = fixture({ execute: false });
    state.hasFormulas = true;
    ns.getPlayer = () => ({ money: state.cash, city: "Sector-12", factions: ["CyberSec", "Aevum"] });
    ns.singularity.getFactionRep = faction => faction === "CyberSec" ? 90 : 30;
    ns.singularity.getFactionWorkTypes = faction => faction === "Aevum" ? ["hacking", "field"] : ["hacking"];
    ns.singularity.getFactionFavor = () => 0;
    ns.formulas = { work: { factionGains: (_player, type) => ({ reputation: type === "field" ? 20 : 1 }) } };
    await main(ns);
    assert.match(state.logs[0], /"nextWork":\{"faction":"Aevum","type":"field","estimatedCycles":3.5/);
    assert.deepEqual(state.events, []);
});

test("own faction work continues until useful target is unlocked, then study begins", async () => {
    const { ns, state } = fixture();
    state.onTick = tick => { if (tick === 2) state.rep = 100; };
    await main(ns);
    assert.deepEqual(state.events, [
        ["work", "CyberSec", "hacking", false],
        ["study", "Rothman University", "Computer Science", false],
    ]);
});

test("same-shaped work with a new identity is operator takeover", async () => {
    const { ns, state } = fixture({ budget: 400 });
    state.onTick = () => {
        state.work = { ...state.work, nextCompletion: token() };
        state.rep = 100;
    };
    await main(ns);
    assert.deepEqual(state.events, [["work", "CyberSec", "hacking", false]]);
    assert.match(state.logs.at(-1), /externally owned/);
});

test("manually stopping work does not restart it", async () => {
    const { ns, state } = fixture();
    state.onTick = () => { state.work = null; };
    await main(ns);
    assert.equal(state.events.length, 1);
    assert.match(state.logs.at(-1), /cancelled/);
});

test("successive rounds reprice and respect cumulative session budget", async () => {
    const { ns, state } = fixture({ budget: 370, reserve: 100 });
    state.rep = 100;
    state.onTick = tick => { if (tick === 1) state.prices.Beta = 180; };
    await main(ns);
    assert.deepEqual(state.purchases, ["Alpha"]);
    assert.equal(state.cash, 800);
});

test("cash floor and competing spender constrain automatic purchases", async () => {
    const { ns, state } = fixture({ budget: 1_000, reserve: 750 });
    state.rep = 100;
    state.processes = [{ filename: "trader.ts" }];
    state.onTick = tick => { if (tick === 1) state.processes = []; };
    await main(ns);
    assert.deepEqual(state.events.map(event => event[0]), ["study", "purchase"]);
    assert.equal(state.cash, 800);
});

test("emergency RAM, reset generation, and incompatible version stop the loop", async () => {
    for (const [change, diagnostic] of [
        [state => { state.spare = 4; }, /emergency controls/],
        [state => { state.generation++; }, /reset generation/],
    ]) {
        const { ns, state } = fixture();
        state.onTick = () => change(state);
        await main(ns);
        assert.equal(state.events.length, 1);
        assert.match(state.logs.at(-1), diagnostic);
    }
    const { ns, state } = fixture();
    state.version = "3.0.2";
    await main(ns);
    assert.match(state.logs[0], /requires home and Singularity/);
    assert.deepEqual(state.events, []);
});

test("session buys at most eight augmentations", async () => {
    const { ns, state } = fixture({ budget: 100, reserve: 10 });
    state.rep = 100;
    state.maxTicks = 10;
    state.offers = Array.from({ length: 10 }, (_, index) => `Aug ${index}`);
    state.prices = Object.fromEntries(state.offers.map(name => [name, 1]));
    await main(ns);
    assert.equal(state.purchases.length, 8);
});

test("deadline stops the controller and leaves player work running", async context => {
    const { ns, state } = fixture({ minutes: 1 });
    let now = 0;
    context.mock.method(Date, "now", () => now);
    state.onTick = () => { now += 60_000; };
    await main(ns);
    assert.equal(state.ticks, 1);
    assert.equal(state.work.type, "FACTION");
    assert.match(state.logs.at(-1), /Session ended/);
});

test("scheduler child waits while manual work is active and stops after manual takeover", async () => {
    const { ns, state } = fixture({ "wait-idle": true });
    state.work = { type: "CRIME", nextCompletion: token() };
    state.onTick = tick => {
        if (tick === 2) state.work = null;
        if (tick === 3) state.work = { type: "CRIME", nextCompletion: token() };
    };
    await main(ns);
    assert.deepEqual(state.events, [["work", "CyberSec", "hacking", false]]);
    assert.match(state.logs[0], /Waiting for idle/);
    assert.match(state.logs.at(-1), /externally owned/);
});
