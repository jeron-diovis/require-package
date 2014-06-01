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
              location: /^nested_\w+$/
              public: /^pub_/

          define "public_pkg/main", -> require "public_pkg/nested_pkg/pub_internal"

          define "public_pkg/internal", -> "Secret!"
          define "public_pkg/pub_internal", -> "Available"

          define "public_pkg/nested_pkg/internal", -> "Nested Secret!"
          define "public_pkg/nested_pkg/pub_internal", -> "Nested Available"

          expect(-> require "public_pkg/internal").to.throw /denied/, "Private file is available"
          expect(require "public_pkg/pub_internal").is.equal "Available", "Public file is not available"

          expect(require "public_pkg").is.equal "Nested Available", "Child's public files are not available to parent"
          expect(-> require "public_pkg/nested_pkg/pub_internal").to.throw /denied/, "Child's private files are available from external module"

    describe "from inside package", ->
      it "should be allowed", ->
        require.packages.init "test"
        define "test/main", -> require "test/main/internal"
        define "test/main/internal", -> "Secret!"
        expect(require "test").is.equal "Secret!"


  describe "access to external files from inside package", ->
    it "should be denied by default", ->
      require.packages.init /^packages\/\w+$/
      define "external_module", ->
      define "packages/test/main", -> require "external_module"
      expect(-> require "packages/test/main").to.throw /denied/, "External file is available"

    it "should be allowed for explicitly listed files", ->
      require.packages.init [
        {
          location: "packages/with_externals"
          external: ["utils", "lib/support"]
        }
      ]

      define "utils", -> "utils"
      define "lib/support", -> "support"
      define "packages/with_externals/main", ->
        utils:   require "utils"
        support: require "lib/support"

      expect(require "packages/with_externals").is.deep.equal utils: "utils", support: "support"



  describe "nested packages access", ->
    describe "from parent to children", ->
      it "should be allowed for children's main files", ->
        require.packages.init
          location: /^packages\/\w+$/
          packages:
            location: /^nested_\w+$/
            packages: /^depths_\w+$/

        # some workaround to test function execution results without sinon
        error = null
        childMain = null
        childPrivate = null

        define "packages/test/main", ->
          childMain = require "packages/test/nested_pkg"
          try
            childPrivate = require "packages/test/nested_pkg/internal"
          catch e
            error = e

        define "packages/test/nested_pkg/main", -> require "packages/test/nested_pkg/depths_deep"
        define "packages/test/nested_pkg/internal", -> "Still secret!"
        define "packages/test/nested_pkg/depths_deep/main", -> "we need to go deeper"

        require "packages/test"
        expect(childMain).is.equal "we need to go deeper"
        expect(childPrivate).is.null
        expect(error).is.an.instanceOf Error

 # describe "from children to parent", ->
