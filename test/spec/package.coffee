describe "requiring packages", ->
  extend = (dest, src) -> dest[key] = val for key, val of src; dest
  clone = (src) -> extend {}, src
  cfg = prevCfg = null

  setDefaults = -> extend cfg,
    "main": "main"
    "public": false
    "externals": false

  beforeEach ->
    cfg = require.packages.defaults
    prevCfg = clone cfg
    setDefaults()
  afterEach -> require.packages.defaults = clone prevCfg

  # impossible to define packages in each test separately, as plugin denies multiple initialization
  require.packages.init [
    /^packages\/\w+$/

    {
      location: "packages/public_pkg"
      public: /^pub_/
    }

    (modulePath) -> modulePath is "functional_package"

    {
      location: /^packages\/failed_pub_package$/
      public: /^pub_/
    }

    {
      location: "packages/with_externals"
      external: ["utils", "lib/support"]
    }

    {
      location: /^packages\/failed_external_package$/
      external: (modulePath) -> modulePath.indexOf("utils") is 0
    }
  ]

  it "should allow direct access to main file", ->
    define "packages/test/main", -> 42
    expect(require "packages/test/main").is.equal 42

  it "should automatically append main file to package path", ->
    define "packages/test/main", -> 42
    expect(require "packages/test").is.equal 42

    define "packages/empty", -> "package without files"
    expect(require "packages/empty").is.undefined


  describe "access to package internal files", ->
    describe "from outside of package", ->
      it "should be denied by default", ->
        define "packages/test/main/internal", -> "Secret!"
        define "packages/friend/main", -> require "packages/test/main/internal"
        expect(-> require "packages/test/main/internal").to.throw /denied/, "Private file is available from outside"
        expect(-> require "packages/friend").to.throw /denied/, "Private file is available from another package"

      it "should be allowed for explicitly listed files", ->
        define "packages/public_pkg/internal", -> "Secret!"
        define "packages/public_pkg/pub_internal", -> "Available"
        expect(-> require "packages/public_pkg/internal").to.throw /denied/, "Private file is available"
        expect(require "packages/public_pkg/pub_internal").is.equal "Available", "Public file is not available"

    describe "from inside package", ->
      it "should be allowed", ->
        define "packages/test/main", -> require "packages/test/main/internal"
        define "packages/test/main/internal", -> "Secret!"
        expect(require "packages/test/main").is.equal "Secret!"


  describe "access to external files from inside package", ->
    it "should be denied by default", ->
      define "external_module", ->
      define "packages/test/main", -> require "external_module"
      expect(-> require "packages/test/main").to.throw /denied/, "External file is available"

    it "should be allowed for explicitly listed files", ->
      define "utils", -> "utils"
      define "lib/support", -> "support"
      define "packages/with_externals/main", ->
        utils: require "utils"
        support: require "lib/support"

      expect(require "packages/with_externals").is.deep.equal utils: "utils", support: "support"


  describe "parsing", ->
    it "should support functional location definitions", ->
      define "functional_package/main", -> "func"
      expect(require "functional_package").is.equal "func"

    it "should expand regexps and define new packages in order they are listed", ->
      # these packages has public/external files, but first /^packages\/\w+$/ will be parsed,
      # and new packages will be created with global defaults - where public/externals files are disabled

      define "packages/failed_pub_package/pub_internal", -> "Available"
      expect(-> require "packages/failed_pub_package/pub_internal").to.throw /denied/, "Wow, it works"

      define "utils", -> "utils"
      define "packages/failed_external_package/main", -> require "utils"
      expect(-> require "packages/failed_external_package").to.throw /denied/, "Wow, it works"