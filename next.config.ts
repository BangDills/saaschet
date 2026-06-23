import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @huggingface/transformers and its ONNX Runtime backends must not be
  // bundled — they contain WASM files and optional native binaries that
  // need to be resolved at runtime from node_modules.
  serverExternalPackages: [
    "@huggingface/transformers",
    "onnxruntime-node",
    "onnxruntime-web",
  ],
};

export default nextConfig;
