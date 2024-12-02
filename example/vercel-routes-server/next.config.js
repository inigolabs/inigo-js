/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.externals = [
      ...config.externals,
      {
        "@yuuang/ffi-rs-darwin-arm64": "commonjs @yuuang/ffi-rs-darwin-arm64",
        "ffi-rs": "commonjs ffi-rs",
        "inigo.js": "commonjs inigo.js",
      },
    ];
    return config;
  },
};

module.exports = nextConfig;
