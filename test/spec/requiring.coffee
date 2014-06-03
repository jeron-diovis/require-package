describe "requiring packages", ->

  it "should automatically append main file to package path", ->
    require.packages.init /^pkg\/\w+$/

    define "pkg/test/main", -> 42
    define "pkg/empty", -> "package without files"

    expect(require "pkg/test").is.equal 42
    expect(require "pkg/empty").is.undefined # "main" file is not found


  describe "access to package main file", ->
    it "should be allowed only in current scope, without nesting", ->
      require.packages.init
        location: "external"
        packages:
          location: "internal"
          packages:
            location: "core"

      define "external/main", -> "external"
      define "external/internal/main", -> "internal"
      define "external/internal/core/main", -> "core"

      expect(require "external").is.equal "external"
      expect(-> require "external/internal").to.throw Error, /internal.*denied/, "Main file of nested package is available from outside"
      expect(-> require "external/internal/core").to.throw Error, /internal.*denied/, "Main file of deep nested package is available from outside"

      define "external/main", -> require "external/internal"
      define "external/internal/main", -> require "external/internal/core"
      define "external/internal/core/main", -> "core"

      expect(require "external").is.equal "core"


  describe "access to package internal files", ->
    describe "from outside of package", ->
      it "should be denied by default", ->
        require.packages.init /^pkg\/\w+$/

        define "pkg/test/main/internal", -> "Secret!"
        define "pkg/friend/main", -> require "pkg/test/main/internal"

        expect(-> require "pkg/test/main/internal").to.throw /denied/, "Private file is available from outside"
        expect(-> require "pkg/friend").to.throw /denied/, "Private file is available from another package"

      describe "for explicitly listed files", ->
        it "should be allowed only in direct parent's scope", ->
          require.packages.init
            location: "public_pkg"
            public: /^pub_/
            packages:
              location: "nested_pkg"
              public: /^pub_nested_/


          define "public_pkg/internal", -> "Secret!"
          define "public_pkg/pub_internal", -> "Available"

          expect(-> require "public_pkg/internal").to.throw Error, /internal.*outside.*denied/, "Private file is available"
          expect(require "public_pkg/pub_internal").is.equal "Available", "Public file is not available"


          define "public_pkg/main", -> require "public_pkg/nested_pkg/pub_nested_internal"
          define "public_pkg/nested_pkg/internal", -> "Nested Secret!"
          define "public_pkg/nested_pkg/pub_nested_internal", -> "Nested Available"

          expect(-> require "public_pkg/nested_pkg/pub_nested_internal").to.throw Error, /internal.*outside.*denied/, "Child's private files are available from external module"
          expect(require "public_pkg").is.equal "Nested Available", "Child's public files are not available to parent"

    describe "from inside package", ->
      it "should be allowed", ->
        require.packages.init "test"
        define "test/main", -> require "test/main/internal"
        define "test/main/internal", -> "Secret!"
        expect(require "test").is.equal "Secret!"

    # TODO: test "protected" option (child-to-parent access)
    #describe "from children package", ->
    #  it "should be allowed only for parent's 'protected' files", ->

  describe "access to external files from inside package", ->
    it "should be denied by default", ->
      require.packages.init "test_pkg"
      define "external_module", ->
      define "test_pkg/main", -> require "external_module"
      expect(-> require "test_pkg").to.throw /denied/, "External file is available"

    it "should be allowed for explicitly listed files", ->
      require.packages.init
        location: "packages/with_externals"
        external: ["utils", "lib/support"]

      define "utils", -> "utils"
      define "lib/support", -> "support"
      define "packages/with_externals/main", ->
        utils:   require "utils"
        support: require "lib/support"

      expect(require "packages/with_externals").is.deep.equal utils: "utils", support: "support"

    # TODO: test "external" option that is is restricted to parent's one only
    #describe "from nested package", ->
    #  it "should be restricted only to parent's 'external' files", ->


  describe "nested packages access", ->
    describe "from parent to children", ->
      it "should be allowed for children's main files", ->
        require.packages.init
          location: "test_pkg"
          packages:
            location: /^nested_\w+$/
            packages: /^deep_\w+$/

        # some workaround to test function execution results without sinon
        error = null
        childMain = null
        childPrivate = null

        define "test_pkg/main", ->
          childMain = require "test_pkg/nested_pkg"
          try
            childPrivate = require "test_pkg/nested_pkg/internal"
          catch e
            error = e

        define "test_pkg/nested_pkg/main", -> require "test_pkg/nested_pkg/deep_pkg"
        define "test_pkg/nested_pkg/internal", -> "Still secret!"
        define "test_pkg/nested_pkg/deep_pkg/main", -> "we need to go deeper"

        require "test_pkg"
        expect(childMain).is.equal "we need to go deeper"
        expect(childPrivate).is.null
        expect(error).is.an.instanceOf Error

    # TODO: test inheritance settings

 # describe "from children to parent", ->
