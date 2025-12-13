{
  bun2nix,
  bunNix,
  src,
  ...
}:

bun2nix.mkDerivation {
  pname = "engrams";
  version = "1.0.0";
  src = src;
  bunDeps = bun2nix.fetchBunDeps {
    inherit bunNix;
  };

  # Don't use the default bun build (which expects --compile)
  dontUseBunBuild = true;

  # Custom build phase for both plugin bundle and CLI
  buildPhase = ''
    runHook preBuild

    # Build the minified plugin bundle
    bun build ./src/index.ts \
      --outfile ./dist/engrams.bundle.js \
      --target node \
      --minify \
      --external zod \
      --external @opencode-ai/plugin

    # Build the CLI
    bun build ./src/cli/index.ts \
      --outfile ./dist/cli.js \
      --target node

    runHook postBuild
  '';

  # Don't use the default install phase (which expects a compiled binary)
  dontUseBunInstall = true;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin $out/share/engrams
    cp dist/engrams.bundle.js $out/share/engrams/engrams.min.js
    cp dist/cli.js $out/bin/engram
    chmod +x $out/bin/engram
    runHook postInstall
  '';
}
