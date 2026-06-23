import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @huggingface/transformers uses ONNX Runtime native bindings that
  // cannot be bundled by webpack. Keep it as an external require.
  serverExternalPackages: ["@huggingface/transformers"],
};

export default nextConfig;
