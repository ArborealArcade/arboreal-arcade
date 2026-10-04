import type { NextConfig } from "next";

// The independent Arboreals By Bunn static site is mounted under one removable prefix.
const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/arboreals-by-bunn", destination: "/abb-site/index.html" },
        { source: "/arboreals-by-bunn/:page(about|animals|enclosures|dojo|first-clutch|contact)", destination: "/abb-site/:page/index.html" },
        { source: "/arboreals-by-bunn/enclosures/:product(neonate|sub-adult|adult|breeder)", destination: "/abb-site/enclosures/:product/index.html" },
        { source: "/arboreals-by-bunn/assets/:asset*", destination: "/abb-site/assets/:asset*" },
        { source: "/arboreals-by-bunn/styles.css", destination: "/abb-site/styles.css" },
        { source: "/arboreals-by-bunn/app.js", destination: "/abb-site/app.js" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
