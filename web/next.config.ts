import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  serverExternalPackages: ["argon2", "postgres"],
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  sourcemaps: { disable: true },
  telemetry: false,
});
