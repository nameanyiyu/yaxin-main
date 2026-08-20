import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const localIpv4Origins = Object.values(networkInterfaces())
  .flatMap((addresses) => addresses ?? [])
  .filter((address) => address.family === "IPv4" && !address.internal)
  .map((address) => address.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...new Set(["localhost", "127.0.0.1", ...localIpv4Origins])],
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
