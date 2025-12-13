{
  self',
  ...
}:
{
  openmodule = {
    type = "app";
    program = "${self'.packages.openmodule}/bin/openmodule";
  };
}
