describe "requiring packages", ->

  it "should automatically append main file to package path", ->
    require.packages.init /^pkg\/\w+$/

    define "pkg/test/index", -> 42
    define "pkg/empty", -> "package without files"

    expect(require "pkg/test").is.equal 42
    expect(require "pkg/empty").is.undefined # "main" file is not found


  describe "access to package main file", ->
    it "should be allowed only in current scope, without nesting", ->
      require.packages.init
        location: "external"
        packages:
          location: /^internal$/ # mix location definitions to test whether is works also
          packages:
            location: (path) -> path is "core"

      define "external/index", -> "external"
      define "external/internal/index", -> "internal"
      define "external/internal/core/index", -> "core"

      expect(require "external/index").is.equal "external"
      expect(-> require "external/internal/index").to.throw Error, /internal.*denied/, "Main file of nested package is available from outside"
      expect(-> require "external/internal/core/index").to.throw Error, /internal.*denied/, "Main file of deep nested package is available from outside"

      define "external/index", -> require "external/internal/index"
      define "external/internal/index", -> require "external/internal/core/index"
      define "external/internal/core/index", -> "core"

      expect(require "external/index").is.equal "core"


  describe "access to package internal files", ->
    describe "from outside of package", ->
      it "should be denied by default", ->
        require.packages.init /^pkg\/\w+$/

        define "pkg/test/internal", -> "Secret!"
        define "pkg/friend/index", -> require "pkg/test/main/internal"

        expect(-> require "pkg/test/internal").to.throw /denied/, "Private file is available from outside"
        expect(-> require "pkg/friend").to.throw /denied/, "Private file is available from another package"

      describe "for explicitly listed files", ->
        it "should be allowed only in direct parent's scope", ->
          require.packages.init
            location: "public_pkg"
            public: /^pub_/
            packages:
              location: "nested_pkg"
              public: /^nested_pub_/


          define "public_pkg/internal", -> "Secret!"
          define "public_pkg/pub_internal", -> "Available"

          expect(-> require "public_pkg/internal").to.throw Error, /internal.*outside.*denied/, "Private file is available"
          expect(require "public_pkg/pub_internal").is.equal "Available", "Public file is not available"


          define "public_pkg/index", -> require "public_pkg/nested_pkg/nested_pub_internal"
          define "public_pkg/nested_pkg/internal", -> "Nested Secret!"
          define "public_pkg/nested_pkg/nested_pub_internal", -> "Nested Available"

          expect(-> require "public_pkg/nested_pkg/nested_pub_internal").to.throw Error, /internal.*outside.*denied/, "Child's private files are available from external module"
          expect(require "public_pkg").is.equal "Nested Available", "Child's public files are not available to parent"

    describe "from inside package", ->
      it "should be allowed", ->
        require.packages.init "test"
        define "test/index", -> require "test/internal"
        define "test/internal", -> "Secret!"
        expect(require "test").is.equal "Secret!"

    describe "for nested packages", ->
      describe "from child to parent", ->
        it "should be available *only* parent's 'protected' files", ->
          require.packages.init
            location: "parent"
            protected: "protected"
            public: /.*/ # just for test
            packages:
              location: "child"
              public: /.*/

          define "parent/protected", -> "Available"
          define "parent/private", -> "Denied!"
          define "parent/public", -> "Also denied!"

          define "parent/proxyProtected", -> require "parent/child/protectedLoader"
          define "parent/proxyPrivate", -> require "parent/child/privateLoader"
          define "parent/proxyPublic", -> require "parent/child/publicLoader"
          define "parent/proxySelf", -> require "parent/child/parentLoader"

          define "parent/child/protectedLoader", -> require "parent/protected"
          define "parent/child/privateLoader", -> require "parent/private"
          define "parent/child/publicLoader", -> require "parent/public"
          define "parent/child/parentLoader", -> require "parent"

          expect(require "parent/proxyProtected").is.equal "Available", "Parent's 'protected' file is not available for child"
          expect(-> require "parent/proxyPrivate").to.throw Error, /Cross-package.*denied/, "Parent's private file is available for child"
          expect(-> require "parent/proxyPublic").to.throw Error, /Cross-package.*denied/, "Parent's public-only file is available for child"
          expect(-> require "parent/proxySelf").to.throw Error, /Cross-package.*denied/, "Parent's package itself is available for child"

        describe "'protected' files of non-direct parents", ->
          it "should not be available by default", ->
            require.packages.init
              location: "parent"
              protected: /^protected_/
              public: /.*/
              inheritable: public: yes
              packages:
                location: "child"
                packages:
                  location: "grandchild"

            define "parent/protected_parent", -> "parent protected"
            define "parent/child/grandchild/grandparentLoader", -> require "parent/protected_parent"

            # ----

            define "parent/child/proxyGrandparent", -> require "parent/child/grandchild/grandparentLoader"
            define "parent/proxyGrandparent", -> require "parent/child/proxyGrandparent"

            expect(-> require "parent/proxyGrandparent").to.throw Error, /Cross-package.*denied/, "Non-direct parent's 'protected' file is available to child"

          it "should be available when explicitly allowed", ->
            require.packages.configure allowRemoteProtected: yes

            require.packages.init
              location: "parent"
              protected: /^protected_/
              public: /.*/
              inheritable: public: yes
              packages:
                location: "child"
                packages:
                  location: "grandchild"

            define "parent/protected_parent", -> "parent protected"
            define "parent/child/grandchild/grandparentLoader", -> require "parent/protected_parent"

            define "parent/child/proxyGrandparent", -> require "parent/child/grandchild/grandparentLoader"
            define "parent/proxyGrandparent", -> require "parent/child/proxyGrandparent"

            expect(require "parent/proxyGrandparent").is.equal "parent protected", "Remote parent's 'protected' file is not available to child"


  describe "access to external files from inside package", ->
    it "should be denied by default", ->
      require.packages.init "test_pkg"
      define "external_module", ->
      define "test_pkg/index", -> require "external_module"
      expect(-> require "test_pkg").to.throw /denied/, "External file is available"

    it "should be allowed for explicitly listed files", ->
      require.packages.init
        location: "packages/with_externals"
        external: ["utils", "lib/support"]

      define "utils", -> "utils"
      define "lib/support", -> "support"
      define "packages/with_externals/index", ->
        utils:   require "utils"
        support: require "lib/support"

      expect(require "packages/with_externals").is.deep.equal utils: "utils", support: "support"

    describe "for nested packages", ->
      it "should be denied to declare own external dependencies", ->
        init = -> require.packages.init
          location: "parent"
          external: "utils"
          packages:
            location: "child"
            external: "helpers"

        expect(init).to.throw Error, /Nested packages can\'t have own "external" dependencies/, "Nested packages can declare own external dependencies"

      it "should be available all the topmost parent's external dependencies", ->
        require.packages.init
          location: "parent"
          external: /^external\//
          public: /.*/ # just for test
          packages:
            location: "child"
            public: /.*/
            packages:
              location: "grandchild"


        define "external/utils", -> "some util"
        define "external/helpers", -> "some helper"

        define "parent/child/utilsLoader", -> require "external/utils"
        define "parent/child/helpersLoader", -> require "parent/child/grandchild"
        define "parent/child/grandchild/index", -> require "external/helpers"

        define "parent/proxyUtils", -> require "parent/child/utilsLoader"
        define "parent/proxyHelpers", -> require "parent/child/helpersLoader"

        expect(require "parent/proxyUtils").is.equal "some util", "Nested package can't access parent's external dependencies"
        expect(require "parent/proxyHelpers").is.equal "some helper", "Deep nested package can't access root parent's external dependencies"
