describe "parsing", ->

  # This suite checks that list of packages can defined as:
  # - string|regexp|function
  # - object { location: <one_of_types_above> }
  # - array of any of above mixed randomly
  #
  # Describing separate short test case for each possible combination will be too verbose and self-repetitive,
  # so cases and assertions here are generated automatically.
  #
  # Maybe, it is bad - to put so complex logic in tests - but so it is guaranteed that all combinations will be tested.
  #
  describe "package location definitions", ->
    definitions =
      strings: "package_strings"
      regexps: /^package_regexps/
      functions: (path) -> path.indexOf("package_functions") is 0

    generators =
      primitives: (location) -> location
      objects: (location) -> {location}

    makePkgName = (type) -> "package_#{type}"
    makePkgContent = (type) -> "main file #{type}"

    makeTestCases = (makeLocationDefinition) ->
      for type, location of definitions
        do (type, location) ->
          it "should support #{type}", ->
            require.packages.init makeLocationDefinition location
            define "#{makePkgName type}/main", -> makePkgContent type
            expect(require makePkgName type).is.equal makePkgContent(type), "#{type} definition is not supported"

    for suite, locationDefiner of generators
      do (locationDefiner) ->
        describe suite, -> makeTestCases locationDefiner

    describe "array of all the things", ->
      it "should also works", ->
        generate = (iterator) ->
          for suite, locationDefiner of generators
            iterator suite, locationDefiner

        packages = []
        generate (suite, makeLocationDefinition) ->
          for type, location of definitions
            do (type, location) ->
              packages.push makeLocationDefinition location
              define "#{makePkgName type}/main", -> makePkgContent type

        require.packages.init packages

        generate (suite) ->
          for type of definitions
            expect(require makePkgName type).is.equal makePkgContent(type), "#{suite}: #{type} definition inside array is not supported"

  it "should expand regexps/functions and define new packages in order they are listed", ->
    # these packages have public/external files, but first /^packages\/\w+$/ will be parsed,
    # and new packages will be created with global defaults - where public/externals files are disabled
    require.packages.init [
      /^packages\/\w+$/
      {
        location: /^packages\/failed_pub_package$/
        public: /^pub_/
      }
      {
        location: /^packages\/failed_external_package$/
        external: "utils"
      }
    ]

    define "packages/failed_pub_package/pub_internal", -> "Available"
    expect(-> require "packages/failed_pub_package/pub_internal").to.throw /denied/, "Wow, it works"

    define "utils", -> "utils"
    define "packages/failed_external_package/main", -> require "utils"
    expect(-> require "packages/failed_external_package").to.throw /denied/, "Wow, it works"
