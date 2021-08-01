import { constants } from "@arkecosystem/core-p2p/dist/constants";
import { parseNesMessage, stringifyNesMessage } from "@arkecosystem/core-p2p/dist/hapi-nes/utils";
import { replySchemas } from "@arkecosystem/core-p2p/dist/schemas";
import { getBlocks, postBlock } from "@arkecosystem/core-p2p/dist/socket-server/codecs/blocks";
import { getCommonBlocks, getPeers, getStatus } from "@arkecosystem/core-p2p/dist/socket-server/codecs/peer";
import { postTransactions } from "@arkecosystem/core-p2p/dist/socket-server/codecs/transactions";
import { Managers, Validation } from "@arkecosystem/crypto";
import { validate } from "json-validator-duplicated-keys";

export const validateAndParseRequest = (message: string, maxTransactionsPerRequest: number): any => {
    let maxPayload = 0;
    const milestone = Managers.configManager.getMilestone();
    if (milestone.block && milestone.block.maxPayload) {
        maxPayload = milestone.block.maxPayload;
    }

    if (typeof message === "string" && message.length <= maxPayload) {
        if (validate(message) === undefined) {
            const parsed = JSON.parse(message);
            if (isValidRequest(parsed, maxTransactionsPerRequest)) {
                return parsed;
            }
        }
    }

    throw new Error();
};

export const validateAndParseResponse = (message: string): any => {
    if (typeof message === "string" && message.length <= constants.DEFAULT_MAX_PAYLOAD) {
        if (validate(message) === undefined) {
            const parsed = JSON.parse(message);
            if (message.length > constants.DEFAULT_MAX_PAYLOAD_CLIENT) {
                const { error } = Validation.validator.validate(replySchemas["p2p.blocks.getBlocks"], parsed.data.data);
                if (error) {
                    throw new Error();
                }
            }

            return parsed;
        }
    }

    throw new Error();
};

export const updateHeaderVersion = (message: Buffer): Buffer => {
    const parsed = parseNesMessage(message);
    let data;

    switch (parsed.path) {
        case "p2p.blocks.getBlocks": {
            data = getBlocks.request.deserialize(parsed.payload!);
            break;
        }
        case "p2p.blocks.postBlock": {
            data = postBlock.request.deserialize(parsed.payload!);
            break;
        }
        case "p2p.peer.getCommonBlocks": {
            data = getCommonBlocks.request.deserialize(parsed.payload!);
            break;
        }
        case "p2p.peer.getPeers": {
            data = getPeers.request.deserialize(parsed.payload!);
            break;
        }
        case "p2p.peer.getStatus": {
            data = getStatus.request.deserialize(parsed.payload!);
            break;
        }
        case "p2p.transactions.postTransactions": {
            data = postTransactions.request.deserialize(parsed.payload!);
            break;
        }
    }

    if (data && data.headers && data.headers.version) {
        data.headers.version = data.headers.version.replace(/-(.*)/, "");
        parsed.payload = data;
        switch (parsed.path) {
            case "p2p.blocks.getBlocks": {
                parsed.payload = getBlocks.request.serialize(parsed.payload);
                break;
            }
            case "p2p.blocks.postBlock": {
                parsed.payload = postBlock.request.serialize(parsed.payload);
                break;
            }
            case "p2p.peer.getCommonBlocks": {
                parsed.payload = getCommonBlocks.request.serialize(parsed.payload);
                break;
            }
            case "p2p.peer.getPeers": {
                parsed.payload = getPeers.request.serialize(parsed.payload);
                break;
            }
            case "p2p.peer.getStatus": {
                parsed.payload = getStatus.request.serialize(parsed.payload);
                break;
            }
            case "p2p.transactions.postTransactions": {
                parsed.payload = postTransactions.request.serialize(parsed.payload);
                break;
            }
        }
        message = stringifyNesMessage(parsed);
    }

    return message;
};

export const updateStatusVersion = (message: Buffer): Buffer => {
    const parsed = parseNesMessage(message);
    const response = getStatus.response.deserialize(parsed.payload!);

    if (response.state && response.config && response.config.version) {
        response.config.version = response.config.version.replace(/-(.*)/, "");
        parsed.payload = getStatus.response.serialize(response);
        message = stringifyNesMessage(parsed);
    }

    return message;
};

const isValidRequest = (object, maxTransactionsPerRequest: number): boolean => {
    if (Object.keys(object).filter((key) => key !== "event" && key !== "data" && key !== "cid").length) {
        return false;
    }

    if (
        typeof object.event !== "string" ||
        typeof object.data !== "object" ||
        (object.event !== "#disconnect" && typeof object.cid !== "number" && object.event === "#disconnect" && typeof object.cid !== "undefined")
    ) {
        return false;
    }

    if (
        ![
            "#handshake",
            "#disconnect",
            "p2p.peer.getBlocks",
            "p2p.peer.getCommonBlocks",
            "p2p.peer.getPeers",
            "p2p.peer.getStatus",
            "p2p.peer.postBlock",
            "p2p.peer.postTransactions"
        ].includes(object.event)
    ) {
        return false;
    }

    if (object.event !== "#handshake" && object.event !== "#disconnect") {
        if (Object.keys(object.data).filter((key) => key !== "data" && key !== "headers").length) {
            return false;
        }
    } else if (object.event === "#handshake") {
        if (Object.keys(object.data).filter((key) => key !== "authToken").length || !!object.data.authToken) {
            return false;
        }
    } else {
        if (Object.keys(object.data).filter((key) => key !== "code").length || !Number.isInteger(object.data.code)) {
            return false;
        }
    }

    if (object.data.data) {
        if (typeof object.data.data !== "object") {
            return false;
        }
        switch (object.event) {
            case "p2p.peer.getBlocks":
                if (
                    !(
                        Object.keys(object.data.data).filter((key) => key !== "lastBlockHeight" && key !== "blockLimit" && key !== "headersOnly" && key !== "serialized").length ===
                            0 &&
                        Number.isInteger(object.data.data.lastBlockHeight) &&
                        object.data.data.lastBlockHeight >= 1 &&
                        ((Number.isInteger(object.data.data.blockLimit) && object.data.data.blockLimit >= 1 && object.data.data.blockLimit <= 400) ||
                            typeof object.data.data.blockLimit === "undefined") &&
                        (typeof object.data.data.headersOnly === "boolean" || typeof object.data.data.headersOnly === "undefined") &&
                        (typeof object.data.data.serialized === "boolean" || typeof object.data.data.serialized === "undefined")
                    )
                ) {
                    return false;
                }
                break;
            case "p2p.peer.getCommonBlocks":
                if (
                    Object.keys(object.data.data).length === 1 &&
                    object.data.data.ids &&
                    Array.isArray(object.data.data.ids) &&
                    object.data.data.ids.length >= 1 &&
                    object.data.data.ids.length <= 10
                ) {
                    for (const id of object.data.data.ids) {
                        if (typeof id !== "string" || !(/^[0-9]{1,20}$/.test(id) || /^[0-9a-f]{16}$/i.test(id) || /^[0-9a-f]{64}$/i.test(id))) {
                            return false;
                        }
                    }
                } else {
                    return false;
                }
                break;
            case "p2p.peer.postBlock":
                if (
                    !(
                        Object.keys(object.data.data).length === 1 &&
                        Object.keys(object.data.data.block).length === 2 &&
                        typeof object.data.data === "object" &&
                        typeof object.data.data.block === "object" &&
                        object.data.data.block.base64 === true &&
                        typeof object.data.data.block.data === "string"
                    )
                ) {
                    return false;
                }
                break;
            case "p2p.peer.postTransactions":
                if (
                    Object.keys(object.data.data).length === 1 &&
                    object.data.data.transactions &&
                    Array.isArray(object.data.data.transactions) &&
                    object.data.data.transactions.length <= maxTransactionsPerRequest
                ) {
                    for (const transaction of object.data.data.transactions) {
                        if (!validateTransactionLight(transaction)) {
                            return false;
                        }
                    }
                } else {
                    return false;
                }
                break;
            default:
                if (Object.keys(object.data.data).length > 0) {
                    return false;
                }
        }
    }

    if (object.data.headers) {
        if (Object.keys(object.data.headers).filter((key) => key !== "version" && key !== "port" && key !== "height" && key !== "Content-Type").length) {
            return false;
        }

        if (
            (object.data.headers.version && typeof object.data.headers.version !== "string") ||
            (object.data.headers.port && typeof object.data.headers.port !== "number") ||
            (object.data.headers["Content-Type"] && typeof object.data.headers["Content-Type"] !== "string") ||
            (object.data.headers.height && typeof object.data.headers.height !== "number")
        ) {
            return false;
        }
    }

    return true;
};

const validateTransactionLight = (transaction: any): boolean => {
    if (!transaction || typeof transaction !== "object") {
        return false;
    }

    const maxMainProperties = 50;
    const maxAssetProperties = 100;
    const maxMultiPayments = 128;

    if (Object.keys(transaction).length > maxMainProperties) {
        return false;
    }

    if (transaction.asset && typeof transaction.asset === "object") {
        if (transaction.asset.payments && Array.isArray(transaction.asset.payments)) {
            if (transaction.asset.payments.length > maxMultiPayments) {
                return false;
            }

            for (const p of transaction.asset.payments) {
                if (!p || typeof p !== "object" || typeof p.recipientId !== "string" || typeof p.amount !== "string" || Object.keys(p).length !== 2) {
                    return false;
                }
            }

            if (Object.keys(transaction.asset).length > 1) {
                return false;
            }
        } else {
            if (objectHasMorePropertiesThan(transaction.asset, maxAssetProperties)) {
                return false;
            }
        }
    }

    const shallowClone = { ...transaction };
    delete shallowClone.asset;
    if (objectHasMorePropertiesThan(shallowClone, maxMainProperties)) {
        return false;
    }

    return true;
};

const objectHasMorePropertiesThan = (obj: object, maxProperties: number): boolean => {
    let propertiesCount = 0;
    try {
        JSON.stringify(obj, (key, value) => {
            propertiesCount++;
            if (propertiesCount > maxProperties) {
                throw new Error();
            }
            return value;
        });
    } catch {
        return true;
    }

    return false;
};
