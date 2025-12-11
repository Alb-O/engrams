{
  bun2nix,
  bunNix,
  src,
  ...
}:

bun2nix.mkDerivation {
  pname = "openmodule";
  version = "0.1.0";
  src = src;
  bunDeps = bun2nix.fetchBunDeps {
    inherit bunNix;
  };
  module = "src/index.ts";
}
