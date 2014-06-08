describe "inheritance", ->
  it "should inherit from parent package explicitly allowed properties", ->
    require.packages.init
      location: "parent"
      public: /^pub_\w+/
      main: "custom_main_file"
      inheritable:
        public: yes
      packages:
        location: "child"

    define "parent/pub_proxyPublic", -> require "parent/child/pub_testPublic"
    define "parent/child/pub_testPublic", -> "child public"

    expect(require "parent/pub_proxyPublic").is.equal "child public", "'Public' option is not inherited"

    define "parent/pub_proxyChild", -> require "parent/child"
    define "parent/child/main", -> "standard main file"

    expect(require "parent/pub_proxyChild").is.equal "standard main file", "'main' option is inherited while it should not be"

  it "should allow to override inheritance settings", ->
    require.packages.init
      location: "parent"
      public: /^pub_\w+/
      main: "custom_main_file"
      inheritable:
        public: yes
        main: yes
      packages:
        location: "child"
        inheritable:
          main: no
        packages:
          location: "grandchild"

    # ----------

    define "parent/child/grandchild/pub_deepPublic", -> "grandchild's public"
    define "parent/child/pub_proxyPublic", -> require "parent/child/grandchild/pub_deepPublic"
    define "parent/pub_proxyGrandchildPublic", -> require "parent/child/pub_proxyPublic"

    expect(require "parent/pub_proxyGrandchildPublic").is.equal "grandchild's public", "Inheritance settings are not inherited"

    # ----------

    define "parent/child/custom_main_file", -> "child's main file"
    define "parent/pub_proxyChildMain", -> require "parent/child"

    expect(require "parent/pub_proxyChildMain").is.equal "child's main file", "'main' option is not inherited"

    define "parent/child/grandchild/main", -> "grandchild's standard main file"
    define "parent/child/pub_proxyGrandchildMain", -> require "parent/child/grandchild"
    define "parent/pub_proxyGrandchildMain", -> require "parent/child/pub_proxyGrandchildMain"

    expect(require "parent/pub_proxyGrandchildMain").is.equal "grandchild's standard main file", "Option inheritance is not overridden"


  it "should allow to break entire inheritance chain", ->
    require.packages.init
      location: "parent"
      public: /^pub_\w+/
      inheritable:
        public: yes
        inheritable: no # children of this package will inherit it's props, but their children will not
      packages:
        location: "child"
        packages:
          location: "grandchild"

    define "parent/pub_proxyPublic", -> require "parent/child/pub_testPublic"
    define "parent/child/pub_testPublic", -> "child public"

    expect(require "parent/pub_proxyPublic").is.equal "child public"

    # -----

    define "parent/child/grandchild/pub_public", -> "Denied!"
    define "parent/child/pub_proxyChild", -> require "parent/child/grandchild/pub_public"
    define "parent/pub_proxyChild", -> require "parent/child/pub_proxyChild"

    expect(-> require "parent/pub_proxyChild").to.throw Error, /Cross-package.*denied/, "Inheritance chain is not broken"