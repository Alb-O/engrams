{
  bun2nix,
  bunNix,
  src,
  pluginBundle,
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

  # Make plugin bundle available at runtime
  postInstall = ''
    mkdir -p $out/share/openmodules
    cp ${pluginBundle}/openmodules.min.js $out/share/openmodules/
  '';
}
