import { app } from "@arkecosystem/core-container";
import { Transactions } from "@arkecosystem/crypto";
import fs from "fs";
import path from "path";
import { SCServerSocket } from "socketcluster-server";

import { getBlocks, postBlock } from "./codecs/blocks";
import { getCommonBlocks, getPeers, getStatus } from "./codecs/peer";
import { postTransactions } from "./codecs/transactions";
import { parseNesMessage, stringifyNesMessage } from "./nes";

export class Server {
    public extend(version: string, hidePrerelease: boolean, isPrerelease: boolean): void {
        const p2p = app.resolvePlugin("p2p");
        if (p2p && !app.resolvePlugin("core-chameleon")) {
            const server: any = p2p.getMonitor().getServer();
            server.options.oldCwd = process.cwd();
            server.options.oldWorkerController = server.options.workerController;
            server.options.workerController = __dirname + "/server.js";
            server.options.version = version;
            server.options.hidePrerelease = hidePrerelease;
            server.options.isPrerelease = isPrerelease;
            server.workerCluster.removeAllListeners("exit");
            server.killWorkers({ killClusterMaster: true });
            server._launchWorkerCluster();
        }
    }
}

if (process.env.workerInitOptions) {
    const workerOptions = JSON.parse(process.env.workerInitOptions);

    (SCServerSocket.prototype as any)._send = SCServerSocket.prototype.send;

    (SCServerSocket.prototype as any).send = function (message) {
        if (!this.socket._isNes) {
            if (workerOptions.hidePrerelease && workerOptions.isPrerelease && message !== "#1") {
                try {
                    const response = JSON.parse(message);
                    if (response.data && response.data.headers && response.data.headers.version) {
                        response.data.headers.version = response.data.headers.version.replace(/-(.*)/, "");
                    }
                    if (response.data && response.data.data && response.data.data.config && response.data.data.config.version) {
                        response.data.data.config.version = response.data.data.config.version.replace(/-(.*)/, "");
                    }
                    message = JSON.stringify(response);
                } catch {
                    //
                }
            }
            return this._send(message);
        }

        if (message === "#1") {
            message = { type: "ping" };
        } else {
            try {
                const { error, data, rid } = JSON.parse(message);
                let isError = !!error;

                if (data && data.pingTimeout) {
                    message = { id: rid, type: "hello", socket: data.id };
                } else {
                    let payload;
                    if (!this.socket._ids) {
                        this.socket._ids = {};
                    }

                    const event = this.socket._ids[rid];

                    if (event === "p2p.blocks.postBlock") {
                        payload = postBlock.response.serialize({ status: !isError, height: data.headers ? data.headers.height : undefined });
                        isError = false;
                    } else if (data && data.data) {
                        switch (event) {
                            case "p2p.blocks.getBlocks": {
                                payload = getBlocks.response.serialize(data.data);
                                break;
                            }
                            case "p2p.peer.getCommonBlocks": {
                                payload = getCommonBlocks.response.serialize(data.data);
                                break;
                            }
                            case "p2p.peer.getPeers": {
                                payload = getPeers.response.serialize(data.data);
                                break;
                            }
                            case "p2p.peer.getStatus": {
                                for (const plugin of Object.keys(data.data.config.plugins)) {
                                    if (plugin === "@arkecosystem/core-api") {
                                        data.data.config.plugins[plugin] = {
                                            port: data.data.config.plugins[plugin].port,
                                            enabled: data.data.config.plugins[plugin].enabled,
                                            estimateTotalCount: !process.env.CORE_API_NO_ESTIMATED_TOTAL_COUNT
                                        };
                                    } else {
                                        data.data.config.plugins[plugin] = { port: data.data.config.plugins[plugin].port, enabled: data.data.config.plugins[plugin].enabled };
                                    }
                                }
                                data.data.config.version = workerOptions.version;
                                payload = getStatus.response.serialize(data.data);
                                break;
                            }
                            case "p2p.transactions.postTransactions": {
                                payload = postTransactions.response.serialize(data.data);
                                break;
                            }
                        }
                    }

                    delete this.socket._ids[rid];

                    if (!this.socket._timers) {
                        this.socket._timers = {};
                    }

                    clearTimeout(this.socket._timers[rid]);
                    delete this.socket._timers[rid];

                    message = {
                        id: rid,
                        type: "request",
                        version: "0",
                        path: "",
                        socket: "",
                        heartbeat: { interval: 0, timeout: 0 },
                        statusCode: isError ? 499 : 200,
                        payload: isError ? Buffer.from(JSON.stringify({ error: "Unknown", ...error })) : payload
                    };
                }
            } catch {
                //
            }
        }
        return this._send(stringifyNesMessage(message));
    };

    // @ts-ignore
    const handleNes = (req, socket, message) => {
        if (typeof message === "string" || req.url !== "/") {
            return message;
        }

        try {
            const nesMessage = parseNesMessage(message);
            socket._isNes = true;
            switch (nesMessage.type) {
                case "ping": {
                    return "#2";
                    break;
                }
                case "hello": {
                    return JSON.stringify({ event: "#handshake", data: {}, cid: 1 });
                    break;
                }
                case "request": {
                    let data: any = {};
                    switch (nesMessage.path) {
                        case "p2p.blocks.getBlocks": {
                            data = getBlocks.request.deserialize(nesMessage.payload);
                            break;
                        }
                        case "p2p.blocks.postBlock": {
                            data = { block: { base64: true, data: postBlock.request.deserialize(nesMessage.payload).block.toString("base64") } };
                            break;
                        }
                        case "p2p.peer.getCommonBlocks": {
                            data = getCommonBlocks.request.deserialize(nesMessage.payload);
                            break;
                        }
                        case "p2p.peer.getPeers": {
                            data = getPeers.request.deserialize(nesMessage.payload);
                            break;
                        }
                        case "p2p.peer.getStatus": {
                            data = getStatus.request.deserialize(nesMessage.payload);
                            break;
                        }
                        case "p2p.transactions.postTransactions": {
                            data = postTransactions.request.deserialize(nesMessage.payload);
                            data.transactions = data.transactions.map((transaction) => Transactions.TransactionFactory.fromBytesUnsafe(transaction).data);
                            break;
                        }
                    }
                    delete data.headers;
                    message = JSON.stringify({
                        event: (nesMessage.path || "").replace(/(p2p.blocks|p2p.transactions).(.*)/, "p2p.peer.$2"),
                        data: { data, headers: {} },
                        cid: nesMessage.id
                    });
                    break;
                }
            }

            if (nesMessage.path && nesMessage.id) {
                if (!socket._ids) {
                    socket._ids = {};
                }

                if (!socket._timers) {
                    socket._timers = {};
                }

                socket._ids[nesMessage.id] = nesMessage.path;

                socket._timers[nesMessage.id] = setTimeout(() => {
                    if (nesMessage.id) {
                        delete socket._ids[nesMessage.id];
                        delete socket._timers[nesMessage.id];
                    }
                }, 30000);
            }
        } catch {
            //
        }
        return message;
    };

    process.chdir(path.dirname(workerOptions.oldWorkerController));

    // @ts-ignore
    const relativeRequire: object = (name: string): object => {
        let fullname = name;
        if (name && name.length && name.charAt(0) === ".") {
            fullname = path.join(process.cwd(), name);
        }
        return require(fullname);
    };

    // tslint:disable-next-line
    eval(
        fs
            .readFileSync(workerOptions.oldWorkerController)
            .toString()
            .replace(/require\(/g, "relativeRequire(")
            .replace("async run() {", "$& delete this.scServer.wsServer.options.path;")
            .replace('ws.prependListener("message", message => {', "$& message = handleNes(req, ws, message);")
            .split("\n")
            .filter((line) => line.toLowerCase().indexOf("socket worker") === -1)
            .join("\n")
    );

    process.chdir(workerOptions.oldCwd);
}
