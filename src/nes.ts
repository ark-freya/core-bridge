export interface NesMessage {
    type?: string;
    id?: number;
    path?: string;
    payload?: Buffer;
    statusCode?: number;
    version?: string;
    socket?: string;
    heartbeat?: {
        interval?: number;
        timeout?: number;
    };
}

export const parseNesMessage = (buf: Buffer): NesMessage => {
    const messageLength = buf.byteLength;
    if (messageLength < 14) {
        throw new Error("Nes message is below minimum length");
    }

    const version = buf.readUInt8(0).toString();

    const mapTypeIntToString = { 0: "hello", 1: "ping", 2: "update", 3: "request", 9: "undefined" };

    const type = mapTypeIntToString[buf.readUInt8(1)];
    if (!type) {
        throw new Error("Type is invalid");
    }

    const id = buf.readUInt32BE(2);

    const statusCode = buf.readUInt16BE(6);

    const pathLength = buf.readUInt8(8);
    if (pathLength > 100 || buf.byteLength < 14 + pathLength) {
        throw new Error("Invalid path length");
    }
    const path = buf.slice(14, 14 + pathLength).toString();

    const socketLength = buf.readUInt8(9);
    if (socketLength > 100 || buf.byteLength < 14 + pathLength + socketLength) {
        throw new Error("Invalid socket length");
    }
    const socket = buf.slice(14 + pathLength, 14 + pathLength + socketLength).toString();

    const heartbeat = { interval: buf.readUInt16BE(10), timeout: buf.readUInt16BE(12) };

    const payload = buf.slice(14 + pathLength + socketLength);

    return { version, type, id, statusCode, path, payload, socket, heartbeat };
};

export const stringifyNesMessage = (messageObj: NesMessage): Buffer => {
    const pathBuf = Buffer.from(messageObj.path || "");
    const socketBuf = Buffer.from(messageObj.socket || "");
    const payloadBuf = Buffer.from(messageObj.payload || Buffer.alloc(0));

    const bufHeader = Buffer.alloc(14);

    const mapTypeStringToInt = { hello: 0, ping: 1, update: 2, request: 3, undefined: 9 };

    bufHeader.writeUInt8(Number.parseInt(messageObj.version || "0"), 0);
    bufHeader.writeUInt8(mapTypeStringToInt[messageObj.type ?? "undefined"] ?? mapTypeStringToInt["undefined"], 1);
    bufHeader.writeUInt32BE(messageObj.id || 1, 2);
    bufHeader.writeUInt16BE(messageObj.statusCode || 200, 6);
    bufHeader.writeUInt8(pathBuf.byteLength, 8);
    bufHeader.writeUInt8(socketBuf.byteLength, 9);
    bufHeader.writeUInt16BE(messageObj.heartbeat?.interval || 0, 10);
    bufHeader.writeUInt16BE(messageObj.heartbeat?.timeout || 0, 12);

    return Buffer.concat([bufHeader, pathBuf, socketBuf, payloadBuf]);
};
