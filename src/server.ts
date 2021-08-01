import { Container, Contracts, Providers } from "@arkecosystem/core-kernel";
import { Listener } from "@arkecosystem/core-p2p/dist/hapi-nes/listener";
import { Socket } from "@arkecosystem/core-p2p/dist/hapi-nes/socket";
import { parseNesMessage, stringifyNesMessage } from "@arkecosystem/core-p2p/dist/hapi-nes/utils";
import { getBlocks, postBlock } from "@arkecosystem/core-p2p/dist/socket-server/codecs/blocks";
import { getCommonBlocks, getPeers, getStatus } from "@arkecosystem/core-p2p/dist/socket-server/codecs/peer";
import { postTransactions } from "@arkecosystem/core-p2p/dist/socket-server/codecs/transactions";
import { Interfaces, Transactions } from "@arkecosystem/crypto";

import { updateHeaderVersion, updateStatusVersion, validateAndParseRequest } from "./utils";

@Container.injectable()
export class Server {
    @Container.inject(Container.Identifiers.Application)
    private readonly app!: Contracts.Kernel.Application;

    public extend(version: string, realVersion: string, hidePrerelease: boolean, isPrerelease: boolean): void {
        const NesListener: any = Listener;
        const NesSocket: any = Socket;

        const maxTransactionsPerRequest: number = this.app
            .getTagged<Providers.PluginConfiguration>(Container.Identifiers.PluginConfiguration, "plugin", "@arkecosystem/core-transaction-pool")
            .getOptional<number>("maxTransactionsPerRequest", 40);

        NesListener.prototype.__add = NesListener.prototype._add;
        NesListener.prototype._add = function (ws, req) {
            ws._isSocketCluster = req.url === "/socketcluster/";
            ws._send = ws.send;
            ws.send = (message, options, cb) => {
                try {
                    if (ws._isSocketCluster) {
                        const nesMessage = parseNesMessage(message);
                        let scObject: any = { rid: nesMessage.id, data: { data: {}, headers: {} } };
                        switch (nesMessage.type) {
                            case "ping": {
                                message = "#1";
                                break;
                            }
                            case "hello": {
                                scObject = { ...scObject, data: { id: nesMessage.socket, pingTimeout: 60000, isAuthenticated: false, isNes: true } };
                                break;
                            }
                            case "request": {
                                if (!ws._ids) {
                                    ws._ids = {};
                                }

                                const event = ws._ids[nesMessage.id!];

                                if (nesMessage.statusCode === 200 && nesMessage.payload) {
                                    switch (event) {
                                        case "p2p.peer.getBlocks": {
                                            scObject.data.data = getBlocks.response.deserialize(nesMessage.payload).map((block) => {
                                                if (block.transactions.length === 0) {
                                                    delete block.transactions;
                                                }
                                                return block;
                                            });
                                            break;
                                        }
                                        case "p2p.peer.getCommonBlocks": {
                                            scObject.data.data = getCommonBlocks.response.deserialize(nesMessage.payload);
                                            break;
                                        }
                                        case "p2p.peer.getPeers": {
                                            scObject.data.data = getPeers.response.deserialize(nesMessage.payload).map((peer) => ({ ip: peer.ip }));
                                            break;
                                        }
                                        case "p2p.peer.getStatus": {
                                            const data = getStatus.response.deserialize(nesMessage.payload);
                                            for (const plugin of Object.keys(data.config.plugins)) {
                                                data.config.plugins[plugin] = { port: data.config.plugins[plugin].port, enabled: data.config.plugins[plugin].enabled };
                                            }
                                            data.config.version = version;
                                            scObject.data.data = data;
                                            break;
                                        }
                                        case "p2p.peer.postBlock": {
                                            scObject.data.data = {};
                                            break;
                                        }
                                        case "p2p.peer.postTransactions": {
                                            scObject.data.data = [];
                                            break;
                                        }
                                    }

                                    if (scObject.data.headers) {
                                        scObject.data.headers = { height: getCurrentHeight() };
                                    }
                                } else if (nesMessage.payload) {
                                    scObject = { rid: nesMessage.id, error: { message: JSON.parse(nesMessage.payload.toString()).message } };
                                }

                                delete ws._ids[nesMessage.id!];

                                if (!ws._timers) {
                                    ws._timers = {};
                                }

                                clearTimeout(ws._timers[nesMessage.id!]);
                                delete ws._timers[nesMessage.id!];
                                break;
                            }
                        }
                        if (message !== "#1") {
                            message = JSON.stringify(scObject);
                        }
                    } else {
                        if (hidePrerelease && isPrerelease && message instanceof Buffer) {
                            message = updateStatusVersion(message);
                        }
                    }
                } catch {
                    //
                }
                return ws._send(message, options, cb);
            };
            return this.__add(ws, req);
        };

        NesSocket.prototype.__onMessage = NesSocket.prototype._onMessage;
        NesSocket.prototype._onMessage = async function (message) {
            try {
                if (this._ws._isSocketCluster && typeof message === "string") {
                    if (message === "#2") {
                        message = stringifyNesMessage({ type: "ping" });
                    } else {
                        const { event, data, cid } = validateAndParseRequest(message, maxTransactionsPerRequest);

                        let request: any = { version: "0", type: "request", path: "", id: 0, statusCode: 200, socket: "", heartbeat: { interval: 0, timeout: 0 } };

                        const headers = { headers: { version: realVersion } };

                        request = {
                            ...request,
                            id: cid,
                            path: event.replace(/(p2p.peer.)(getBlocks|postBlock)/, "p2p.blocks.$2").replace("p2p.peer.postTransactions", "p2p.transactions.postTransactions")
                        };

                        switch (event) {
                            case "#disconnect": {
                                this._ws.terminate();
                                return;
                                break;
                            }
                            case "#handshake": {
                                request = { type: "hello", version: "2" };
                                break;
                            }
                            case "p2p.peer.getBlocks": {
                                request = { ...request, payload: getBlocks.request.serialize({ ...(headers as any), ...data.data }) };
                                break;
                            }
                            case "p2p.peer.getCommonBlocks": {
                                request = { ...request, payload: getCommonBlocks.request.serialize({ ...(headers as any), ...data.data }) };
                                break;
                            }
                            case "p2p.peer.getPeers": {
                                request = { ...request, payload: getPeers.request.serialize({ ...(headers as any) }) };
                                break;
                            }
                            case "p2p.peer.getStatus": {
                                request = { ...request, payload: getStatus.request.serialize({ ...(headers as any) }) };
                                break;
                            }
                            case "p2p.peer.postBlock": {
                                request = { ...request, payload: postBlock.request.serialize({ ...(headers as any), block: Buffer.from(data.data.block.data, "base64") }) };
                                break;
                            }
                            case "p2p.peer.postTransactions": {
                                const transactions = data.data.transactions.map((transaction) => Transactions.TransactionFactory.fromData(transaction).serialized);
                                request = { ...request, payload: postTransactions.request.serialize({ ...(headers as any), transactions }) };
                                break;
                            }
                        }

                        message = stringifyNesMessage(request);

                        if (event && (event.startsWith("p2p.") || event === "#handshake")) {
                            if (!this._ws._ids) {
                                this._ws._ids = {};
                            }

                            if (!this._ws._timers) {
                                this._ws._timers = {};
                            }

                            this._ws._ids[cid] = event;

                            this._ws._timers[cid] = setTimeout(() => {
                                if (this._ws && this._ws._ids) {
                                    delete this._ws._ids[cid];
                                }
                                if (this._ws && this._ws._timers) {
                                    delete this._ws._timers[cid];
                                }
                            }, 30000);
                        }
                    }
                } else {
                    if (hidePrerelease && isPrerelease && message instanceof Buffer) {
                        message = updateHeaderVersion(message);
                    }
                }
            } catch {
                //
            }

            return this.__onMessage(message);
        };

        const getCurrentHeight = (): number => {
            const lastBlock: Interfaces.IBlock | undefined = this.app.get<Contracts.State.StateStore>(Container.Identifiers.StateStore).getLastBlock();
            return lastBlock ? lastBlock.data.height : 0;
        };
    }
}
