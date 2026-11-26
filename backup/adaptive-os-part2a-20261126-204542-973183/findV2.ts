import type { NS, AutocompleteData } from "@ns";

interface ExecutionOptions {
    autoBackdoor: boolean;
    dryRun: boolean;
}

export async function main(ns: NS): Promise<void> {
    const rawArgs = ns.args.map(arg => String(arg).trim());
    const flags = new Set(rawArgs.filter(arg => arg.startsWith("--")));
    const positional = rawArgs.filter(arg => !arg.startsWith("--") && arg.length > 0);

    const query = positional[0] ?? "";
    if (!query) {
        ns.tprint("Gunakan: run findV2.ts <nama_server> [--bd] [--dry]");
        return;
    }

    const options: ExecutionOptions = {
        autoBackdoor: flags.has("--bd") || flags.has("--backdoor"),
        dryRun: flags.has("--dry"),
    };

    const resolvedTarget = resolveServerName(ns, query);
    if (!resolvedTarget) {
        return;
    }

    const path = findShortestPath(ns, "home", resolvedTarget);
    if (!path) {
        ns.tprint(`[ERROR] Rute menuju '${resolvedTarget}' tidak ditemukan.`);
        return;
    }

    // Coba buka akses root otomatis jika belum root
    tryAutoRoot(ns, resolvedTarget);

    const server = ns.getServer(resolvedTarget);
    const hasRoot = ns.hasRootAccess(resolvedTarget);
    const reqHack = ns.getServerRequiredHackingLevel(resolvedTarget);
    const playerHack = ns.getHackingLevel();
    const canBackdoor = hasRoot && !server.backdoorInstalled && playerHack >= reqHack;

    const hopList = path.slice(1);
    const connectChain = hopList.map(host => `connect ${host}`).join("; ");
    const willBackdoor = options.autoBackdoor && canBackdoor;
    const fullCommand = willBackdoor ? `${connectChain}; backdoor` : connectChain;

    ns.tprint("");
    ns.tprint(`[ROUTE] ${path.join(" -> ")} (${hopList.length} hop)`);
    ns.tprint(
        `[STATUS] root=${hasRoot ? "YES" : "NO"} | ` +
        `backdoor=${server.backdoorInstalled ? "YES" : "NO"} | ` +
        `hack=${playerHack}/${reqHack}`
    );

    if (options.autoBackdoor && !canBackdoor && !server.backdoorInstalled) {
        ns.tprint(
            `[WARN] Auto-backdoor dilewati: ` +
            (!hasRoot ? "belum memiliki akses root." : `butuh Hack Lv.${reqHack} (saat ini ${playerHack}).`)
        );
    }

    if (options.dryRun) {
        ns.tprint(`[DRY-RUN] ${fullCommand}`);
        return;
    }

    // Eksekusi: Prioritaskan Singularity API jika SF4 tersedia, fallback ke Terminal DOM
    const singularitySuccess = await trySingularityConnect(ns, hopList, willBackdoor);
    if (!singularitySuccess) {
        const injected = injectTerminalCommand(fullCommand);
        if (injected) {
            ns.tprint(`[EXEC:DOM] Menghubungkan ke ${resolvedTarget}${willBackdoor ? " + backdoor" : ""}...`);
        } else {
            ns.tprint(`[FALLBACK] Gagal akses DOM terminal. Copy manual:\n${fullCommand}`);
        }
    }
}

/**
 * Mencari nama server secara exact atau partial/fuzzy match di seluruh jaringan.
 */
function resolveServerName(ns: NS, query: string): string | null {
    const allServers = scanAllServers(ns);
    const lowerQuery = query.toLowerCase();

    const exact = allServers.find(s => s.toLowerCase() === lowerQuery);
    if (exact) return exact;

    const matches = allServers.filter(s => s.toLowerCase().includes(lowerQuery));
    if (matches.length === 1) {
        ns.tprint(`[MATCH] '${query}' -> '${matches[0]}'`);
        return matches[0];
    }

    if (matches.length > 1) {
        ns.tprint(`[AMBIGUOUS] Ditemukan ${matches.length} server cocok untuk '${query}':`);
        ns.tprint(`  ${matches.join(", ")}`);
        return null;
    }

    ns.tprint(`[NOT FOUND] Tidak ada server yang cocok dengan '${query}'.`);
    return null;
}

/**
 * BFS Shortest Path dari start ke target.
 */
function findShortestPath(ns: NS, start: string, target: string): string[] | null {
    const visited = new Set<string>([start]);
    const queue: string[][] = [[start]];

    while (queue.length > 0) {
        const path = queue.shift()!;
        const current = path[path.length - 1];

        if (current === target) return path;

        for (const neighbor of ns.scan(current)) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push([...path, neighbor]);
            }
        }
    }
    return null;
}

/**
 * Mengumpulkan seluruh hostname di jaringan menggunakan DFS.
 */
function scanAllServers(ns: NS): string[] {
    const visited = new Set<string>(["home"]);
    const stack = ["home"];

    while (stack.length > 0) {
        const host = stack.pop()!;
        for (const next of ns.scan(host)) {
            if (!visited.has(next)) {
                visited.add(next);
                stack.push(next);
            }
        }
    }
    return Array.from(visited);
}

/**
 * Membuka port dan menjalankan NUKE otomatis jika program tersedia di home.
 */
function tryAutoRoot(ns: NS, target: string): void {
    if (ns.hasRootAccess(target)) return;

    const openers: Array<[string, (host: string) => void]> = [
        ["BruteSSH.exe", ns.brutessh],
        ["FTPCrack.exe", ns.ftpcrack],
        ["relaySMTP.exe", ns.relaysmtp],
        ["HTTPWorm.exe", ns.httpworm],
        ["SQLInject.exe", ns.sqlinject],
    ];

    let opened = 0;
    for (const [file, fn] of openers) {
        if (ns.fileExists(file, "home")) {
            fn(target);
            opened++;
        }
    }

    const reqPorts = ns.getServerNumPortsRequired(target);
    if (opened >= reqPorts) {
        ns.nuke(target);
        ns.tprint(`[ROOT] Berhasil mendapatkan root access di '${target}'.`);
    }
}

/**
 * Eksekusi resmi via Singularity API (aktif jika Source-File 4 sudah terbuka).
 */
async function trySingularityConnect(
    ns: NS,
    hops: string[],
    installBackdoor: boolean
): Promise<boolean> {
    try {
        // Cek apakah Singularity tersedia tanpa memicu crash jika terkunci
        if (typeof ns.singularity?.connect !== "function") return false;

        ns.singularity.connect("home");
        for (const host of hops) {
            if (!ns.singularity.connect(host)) return false;
        }

        ns.tprint(`[EXEC:SF4] Terhubung ke ${hops[hops.length - 1]}.`);

        if (installBackdoor) {
            ns.tprint(`[EXEC:SF4] Memasang backdoor...`);
            await ns.singularity.installBackdoor();
            ns.tprint(`[EXEC:SF4] Backdoor selesai terpasang!`);
        }
        return true;
    } catch {
        // Singularity masih terkunci (BitNode 1 sebelum SF4)
        return false;
    }
}

/**
 * Menginjeksi perintah langsung ke input terminal React Bitburner (untuk BN1 tanpa SF4).
 */
function injectTerminalCommand(command: string): boolean {
    const doc = eval("document") as Document;
    const terminalInput = doc.getElementById("terminal-input") as HTMLInputElement | null;
    if (!terminalInput) return false;

    const reactPropsKey = Object.keys(terminalInput).find(key => key.startsWith("__reactProps"));
    if (!reactPropsKey) return false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (terminalInput as any)[reactPropsKey];
    terminalInput.value = command;

    props.onChange?.({ target: terminalInput });
    props.onKeyDown?.({
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        preventDefault: () => {},
    });

    return true;
}

export function autocomplete(data: AutocompleteData, args: string[]): string[] {
    const flags = ["--bd", "--dry"];
    const lastArg = args[args.length - 1] ?? "";
    if (lastArg.startsWith("-")) {
        return flags;
    }
    return [...data.servers, ...flags];
}