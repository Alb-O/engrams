{
  description = "OpenCode Modules Plugin";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
    systems.url = "github:nix-systems/default";

    bun2nix.url = "github:baileyluTCD/bun2nix?tag=1.5.2";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
    bun2nix.inputs.systems.follows = "systems";
  };

  nixConfig = {
    extra-substituters = [
      "https://cache.nixos.org"
      "https://cache.garnix.io"
    ];
    extra-trusted-public-keys = [
      "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
      "cache.garnix.io:CTFPyKSLcx5RMJKfLo5EEPUObbA78b0YQ2DTCJXqr9g="
    ];
  };

  outputs =
    {
      self,
      nixpkgs,
      systems,
      bun2nix,
      ...
    }:
    let
      eachSystem = nixpkgs.lib.genAttrs (import systems);
      pkgsFor = eachSystem (system: import nixpkgs { inherit system; });
    in
    {
      packages = eachSystem (system: rec {
        # Plugin bundle (minified JS)
        openmodules-bundle = pkgsFor.${system}.callPackage ./nix {
          bun2nix = bun2nix.packages.${system}.default;
          src = ./.;
          bunNix = ./nix/bun.nix;
        };

        # CLI that depends on the bundled plugin
        openmodule = pkgsFor.${system}.callPackage ./cli/nix {
          bun2nix = bun2nix.packages.${system}.default;
          src = ./cli;
          bunNix = ./cli/nix/bun.nix;
          pluginBundle = openmodules-bundle;
        };

        # Default package should be the CLI, not the raw bundle
        default = openmodule;
      });

      apps = eachSystem (system: {
        openmodule = {
          type = "app";
          program = "${self.packages.${system}.openmodule}/bin/openmodule";
        };
      });

      devShells = eachSystem (system: {
        default = pkgsFor.${system}.mkShell {
          packages = [
            pkgsFor.${system}.bun
            pkgsFor.${system}.nodejs
            bun2nix.packages.${system}.default
          ];

          shellHook = ''
            if [ -t 0 ]; then
              bun install --frozen-lockfile
              (cd cli && bun install --frozen-lockfile)
            fi
          '';
        };
      });
    };
}
