import { app } from "@arkecosystem/core-container";
import { constants } from "@arkecosystem/core-p2p/dist/constants";
import { Transactions } from "@arkecosystem/crypto";

import { SCTransport } from "socketcluster-client/lib/sctransport";
import WebSocket from "ws";

import { getBlocks, postBlock } from "./codecs/blocks";
import { getCommonBlocks, getPeers, getStatus } from "./codecs/peer";
import { postTransactions } from "./codecs/transactions";

import { parseNesMessage, stringifyNesMessage } from "./nes";

export class P2P {
    private static version: string;

    public static register(): void {
        P2P.version = app.getVersion().replace(/-(.*)/, "");

        P2P.extendSCClient();
        P2P.extendSCServer();
    }

    private static extendSCClient(): void {
        const version = `3.0.0-bridge-${P2P.version}`;

        SCTransport.prototype._send = SCTransport.prototype.send;
        SCTransport.prototype.__onClose = SCTransport.prototype._onClose;
        SCTransport.prototype.__onMessage = SCTransport.prototype._onMessage;

        SCTransport.prototype._onMessage = function (message) {
            if (this.options.path === "/") {
                try {
                    const nesMessage = parseNesMessage(message);
                    let scObject: any = { rid: nesMessage.id, data: { data: {}, headers: {} } };
                    switch (nesMessage.type) {
                        case "ping":
                            message = "#1";
                            break;
                        case "hello":
                            scObject = { ...scObject, data: { id: nesMessage.socket, pingTimeout: 60000, isAuthenticated: false } };
                            break;
                        case "request":
                            if (!this.socket._ids) {
                                this.socket._ids = {};
                            }

                            const event = this.socket._ids[nesMessage.id];

                            if (nesMessage.statusCode === 200 && nesMessage.payload) {
                                switch (event) {
                                    case "p2p.peer.getBlocks":
                                        scObject.data.data = getBlocks.response.deserialize(nesMessage.payload).map((block) => {
                                            if (block.transactions.length === 0) {
                                                delete block.transactions;
                                            }
                                            return block;
                                        });
                                        break;
                                    case "p2p.peer.getCommonBlocks":
                                        scObject.data.data = getCommonBlocks.response.deserialize(nesMessage.payload);
                                        break;
                                    case "p2p.peer.getPeers":
                                        scObject.data.data = getPeers.response.deserialize(nesMessage.payload).map((peer) => ({ ip: peer.ip }));
                                        break;
                                    case "p2p.peer.getStatus":
                                        const data = getStatus.response.deserialize(nesMessage.payload);
                                        for (const plugin of Object.keys(data.config.plugins)) {
                                            data.config.plugins[plugin] = { port: data.config.plugins[plugin].port, enabled: data.config.plugins[plugin].enabled };
                                        }
                                        data.config.version = `${P2P.version}-bridge-${data.config.version.replace(/-(.*)/, "")}`;
                                        scObject.data.data = data;
                                        scObject.data.headers.height = data.state.height;
                                        break;
                                    case "p2p.peer.postBlock":
                                        scObject.data.data = {};
                                        break;
                                    case "p2p.peer.postTransactions":
                                        scObject.data.data = [];
                                        break;
                                }
                            } else if (nesMessage.payload) {
                                scObject = { rid: nesMessage.id, error: { message: JSON.parse(nesMessage.payload.toString()).message } };
                            }

                            delete this.socket._ids[nesMessage.id];

                            if (!this.socket._timers) {
                                this.socket._timers = {};
                            }

                            clearTimeout(this.socket._timers[nesMessage.id]);
                            delete this.socket._timers[nesMessage.id];
                            break;
                    }
                    if (message !== "#1") {
                        message = JSON.stringify(scObject);
                        this.socket._receiver._maxPayload = constants.DEFAULT_MAX_PAYLOAD_CLIENT;
                    }
                } catch {
                    //
                }
            } else if (!this._receivedData && message.length < 256) {
                try {
                    const { data } = JSON.parse(message);
                    if (data.isNes) {
                        this.socket.close();
                        return;
                    }
                } catch {
                    //
                }
            }
            this._receivedData = true;
            return this.__onMessage(message);
        };

        SCTransport.prototype.send = function (message) {
            if (this.options.path === "/") {
                if (message === "#2") {
                    message = stringifyNesMessage({ type: "ping" });
                } else {
                    try {
                        const { event, data, cid } = JSON.parse(message);

                        let request: any = { version: "0", type: "request", path: "", id: 0, statusCode: 200, socket: "", heartbeat: { interval: 0, timeout: 0 } };

                        const headers = { headers: { version } };

                        request = {
                            ...request,
                            id: cid,
                            path: event.replace(/(p2p.peer.)(getBlocks|postBlock)/, "p2p.blocks.$2").replace("p2p.peer.postTransactions", "p2p.transactions.postTransactions")
                        };

                        let maxPayload = constants.DEFAULT_MAX_PAYLOAD_CLIENT;

                        switch (event) {
                            case "#disconnect":
                                return;
                                break;
                            case "#handshake":
                                request = { type: "hello", version: "2" };
                                break;
                            case "p2p.peer.getBlocks":
                                maxPayload = constants.DEFAULT_MAX_PAYLOAD;
                                request = { ...request, payload: getBlocks.request.serialize({ ...(headers as any), ...data.data }) };
                                break;
                            case "p2p.peer.getCommonBlocks":
                                request = { ...request, payload: getCommonBlocks.request.serialize({ ...(headers as any), ...data.data }) };
                                break;
                            case "p2p.peer.getPeers":
                                request = { ...request, payload: getPeers.request.serialize({ ...(headers as any) }) };
                                break;
                            case "p2p.peer.getStatus":
                                request = { ...request, payload: getStatus.request.serialize({ ...(headers as any) }) };
                                break;
                            case "p2p.peer.postBlock":
                                request = { ...request, payload: postBlock.request.serialize({ ...(headers as any), block: Buffer.from(data.data.block.data, "base64") }) };
                                break;
                            case "p2p.peer.postTransactions":
                                const transactions = data.data.transactions.map((transaction) => Transactions.TransactionFactory.fromData(transaction).serialized);
                                request = { ...request, payload: postTransactions.request.serialize({ ...(headers as any), transactions }) };
                                break;
                        }

                        this.socket._receiver._maxPayload = maxPayload;

                        message = stringifyNesMessage(request);

                        if (!this.socket._ids) {
                            this.socket._ids = {};
                        }

                        if (!this.socket._timers) {
                            this.socket._timers = {};
                        }

                        this.socket._ids[cid] = event;

                        this.socket._timers[cid] = setTimeout(() => {
                            delete this.socket._ids[cid];
                        }, 30000);
                    } catch {
                        //
                    }
                }
            }
            return this._send(message);
        };

        SCTransport.prototype._onClose = function (code, data) {
            if (!this._receivedData && this.options.path.endsWith("/socketcluster/")) {
                this.options.path = "/";
                this.socket = new WebSocket(`ws://${this.options.hostname}:${this.options.port}/`, undefined, this.options);
                this.socket.onopen = () => {
                    this._onOpen();
                    for (const entry of Object.keys(this._callbackMap)) {
                        if (this._callbackMap[entry].event === "#handshake" && this._callbackMap[entry].cid > 1) {
                            clearTimeout(this._callbackMap[entry].timeout);
                            delete this._callbackMap[entry];
                        }
                    }
                };

                this.socket.onclose = (event) => {
                    const code = event.code === null ? 1005 : event.code;
                    this._onClose(code, event.reason);
                };

                this.socket.onmessage = (message) => {
                    this._onMessage(message.data);
                };

                this.socket.onerror = (error) => {
                    if (this.state === this.CONNECTING) {
                        this._onClose(1006);
                    }
                };

                this._connectTimeoutRef = setTimeout(() => {
                    this._onClose(4007);
                    this.socket.close(4007);
                }, this.connectTimeout);

                return;
            }

            return this.__onClose(code, data);
        };
    }

    private static extendSCServer(): void {
        const p2p = app.resolvePlugin("p2p");
        if (p2p && !app.resolvePlugin("core-chameleon")) {
            const server: any = p2p.getMonitor().getServer();
            server.options.oldCwd = process.cwd();
            server.options.oldWorkerController = server.options.workerController;
            server.options.workerController = __dirname + "/worker.js";
            server.options.version = P2P.version;
            server.workerCluster.removeAllListeners("exit");
            server.killWorkers({ killClusterMaster: true });
            server._launchWorkerCluster();
        }
    }
}
