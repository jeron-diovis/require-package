describe "initialization", ->
  it "should initialize packages config only once", ->
    require.packages.init /^packages\//

    expect(-> require.packages.init /^another_location\//).to.throw Error, /already initialized/, "Packages config can be initialized multiple times"