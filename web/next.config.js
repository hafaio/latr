// Published under github.com/hafaio/latr via GitHub Pages → hafaio.github.io/latr
// Change basePath/assetPrefix if the repo is renamed or a custom domain is used.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
};
