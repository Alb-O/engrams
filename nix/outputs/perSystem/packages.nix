{
  __inputs = {
    bun2nix.url = "github:baileyluTCD/bun2nix?tag=1.5.2";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
    bun2nix.inputs.systems.follows = "systems";
  };

  __functor =
    _:
    {
      pkgs,
      inputs,
      self',
      rootSrc,
      ...
    }:
    let
      bun2nix = inputs.bun2nix.packages.${pkgs.system}.default;
    in
    {
      # Unified package: plugin bundle + CLI
      engrams = pkgs.callPackage (rootSrc + /nix) {
        inherit bun2nix;
        src = rootSrc;
        bunNix = rootSrc + /nix/bun.nix;
      };

      # Alias for backwards compatibility
      engrams-bundle = self'.packages.engrams;

      # CLI is just an alias to the unified package
      engram = self'.packages.engrams;

      # Default package is the unified engrams package
      default = self'.packages.engrams;
    };
}
