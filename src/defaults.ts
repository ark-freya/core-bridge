export const defaults = {
    enabled: true,
    server: {
        host: process.env.CORE_P2P_HOST || "0.0.0.0",
        port: process.env.CORE_P2P_PORT || 4002
    }
};
