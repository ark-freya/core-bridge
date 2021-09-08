import { Container } from "@arkecosystem/core-kernel";
import * as Nes from "@arkecosystem/core-p2p/dist/hapi-nes";
import { parseNesMessage, stringifyNesMessage } from "@arkecosystem/core-p2p/dist/hapi-nes/utils";
import { getBlocks, postBlock } from "@arkecosystem/core-p2p/dist/socket-server/codecs/blocks";
import { getCommonBlocks, getPeers, getStatus } from "@arkecosystem/core-p2p/dist/socket-server/codecs/peer";
import { postTransactions } from "@arkecosystem/core-p2p/dist/socket-server/codecs/transactions";
import { Transactions } from "@arkecosystem/crypto";
import { parse } from "semver";

import { updateHeaderVersion, updateStatusVersion, validateAndParseResponse } from "./utils";

@Container.injectable()
export class Client {
    public extend(realVersion: string, hidePrerelease: boolean, isPrerelease: boolean): void {
        const NesClient: any = Nes.Client;

        NesClient.prototype.__connect = NesClient.prototype._connect;
        NesClient.prototype._connect = function (options, initial, next) {
            if (!this._options) {
                this._options = options;
            }

            if (!this.isNes && !this._url.endsWith("/socketcluster/")) {
                this._url += "/socketcluster/";
            }

            this.__connect(options, initial, next);

            this._ws._send = this._ws.send;
            this._ws.send = (message) => {
                try {
                    if (!this.isNes) {
                        const nesMessage = parseNesMessage(message);
                        switch (nesMessage.type) {
                            case "ping": {
                                message = "#2";
                                break;
                            }
                            case "hello": {
                                message = JSON.stringify({ event: "#handshake", data: {}, cid: 1 });
                                break;
                            }
                            case "request": {
                                if (!nesMessage.payload) {
                                    nesMessage.payload = Buffer.alloc(0);
                                }

                                if (!nesMessage.path) {
                                    nesMessage.path = "";
                                }

                                if (!nesMessage.id) {
                                    nesMessage.id = 0;
                                }

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
                                    event: nesMessage.path.replace(/(p2p.blocks|p2p.transactions).(.*)/, "p2p.peer.$2"),
                                    data: { data, headers: {} },
                                    cid: nesMessage.id
                                });
                                break;
                            }
                        }

                        if (nesMessage.path) {
                            if (!this._ws._ids) {
                                this._ws._ids = {};
                            }

                            if (!this._ws._timers) {
                                this._ws._timers = {};
                            }

                            this._ws._ids[nesMessage.id!] = nesMessage.path;

                            this._ws._timers[nesMessage.id!] = setTimeout(() => {
                                if (this._ws && this._ws._ids) {
                                    delete this._ws._ids[nesMessage.id!];
                                }
                                if (this._ws && this._ws._timers) {
                                    delete this._ws._timers[nesMessage.id!];
                                }
                            }, 30000);
                        }
                    } else {
                        if (hidePrerelease && isPrerelease && message instanceof Buffer) {
                            message = updateHeaderVersion(message);
                        }
                    }
                } catch {
                    //
                }
                return this._ws._send(message);
            };
        };

        NesClient.prototype.__hello = NesClient.prototype._hello;
        NesClient.prototype._hello = function (auth) {
            return new Promise((resolve, reject) => {
                this.__hello(auth)
                    .then(() => {
                        return resolve();
                    })
                    .catch((err) => {
                        if (!this.isNes) {
                            this.isNes = true;
                            this._url = this._url.replace("/socketcluster/", "/");

                            const requests = this._requests;
                            this._requests = {};

                            const ids = Object.keys(requests);
                            for (let i = 0; i < ids.length; ++i) {
                                const id = ids[i];
                                const request = requests[id];
                                clearTimeout(request.timeout);
                            }

                            clearTimeout(this._reconnectionTimer);
                            this._reconnectionTimer = null;

                            if (this._ws) {
                                if (this._ws.readyState !== 2 && this._ws.readyState !== 3) {
                                    this._ws.close();
                                }

                                this._ws.onopen = null;
                                this._ws.onclose = null;
                                this._ws.onerror = null;
                                this._ws.onmessage = null;
                                this._ws = null;
                            }

                            return this._connect(this._options, true, (err) => {
                                if (err) {
                                    return reject(err);
                                }
                                return resolve();
                            });
                        } else {
                            return reject(err);
                        }
                    });
            });
        };

        NesClient.prototype.__onMessage = NesClient.prototype._onMessage;
        NesClient.prototype._onMessage = function (wsMessage) {
            let message = wsMessage.data;

            if (!this._receivedData && !this.isNes && message.length < 256) {
                try {
                    const { data } = JSON.parse(message);
                    if (data.isNes) {
                        this._ws.close();
                        return;
                    }
                } catch {
                    //
                }
            }

            if (!this.isNes && message instanceof Buffer) {
                this._ws.close();
                return;
            }

            this._receivedData = true;

            try {
                if (!this.isNes) {
                    if (message === "#1") {
                        message = { type: "ping" };
                    } else {
                        const { error, data, rid } = validateAndParseResponse(message);
                        let isError = !!error;

                        if (data && data.pingTimeout) {
                            message = { id: rid, type: "hello", socket: data.id };
                        } else {
                            let payload;
                            if (!this._ws._ids) {
                                this._ws._ids = {};
                            }

                            const event = this._ws._ids[rid];
                            if (event === "p2p.blocks.postBlock") {
                                payload = postBlock.response.serialize({ status: !isError, height: data.headers ? data.headers.height : undefined });
                                isError = false;
                            } else if (data && data.data) {
                                switch (this._ws._ids[rid]) {
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
                                        const parsedVersion = parse(data.data.config.version);
                                        data.data.config.version = data.data.config.version.replace(
                                            `${parsedVersion!.major}.${parsedVersion!.minor}.`,
                                            `3.${parsedVersion!.major}${parsedVersion!.minor}.`
                                        );
                                        if (hidePrerelease) {
                                            data.data.config.version = data.data.config.version.replace(/-(.*)/, "");
                                        }
                                        payload = getStatus.response.serialize(data.data);
                                        break;
                                    }
                                    case "p2p.transactions.postTransactions": {
                                        payload = postTransactions.response.serialize(data.data);
                                        break;
                                    }
                                }
                            }

                            delete this._ws._ids[rid];

                            if (!this._ws._timers) {
                                this._ws._timers = {};
                            }

                            clearTimeout(this._ws._timers[rid]);
                            delete this._ws._timers[rid];

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
                    }

                    wsMessage.data = stringifyNesMessage(message);
                } else {
                    if (hidePrerelease && isPrerelease && message instanceof Buffer) {
                        wsMessage.data = updateStatusVersion(message);
                    }
                }
            } catch {
                //
            }
            if (wsMessage.data instanceof Buffer) {
                return this.__onMessage(wsMessage);
            }
        };
    }
}
