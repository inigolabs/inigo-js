/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.externals = [
      ...config.externals,
      {
        "inigo.js": "commonjs inigo.js",
        "koffi": "commonjs koffi",
      },
    ];
    return config;
  },
};

module.exports = nextConfig;
