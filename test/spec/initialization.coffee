describe "initialization", ->
  it "should initialize packages config only once", ->
    require.packages.init /^packages\//

    expect(-> require.packages.init /^another_location\//).to.throw Error, /already initialized/, "Packages config can be initialized multiple times"

  it "should configure plugin config only once", ->
    require.packages.configure packageDefaults: main: "TheMain"

    expect(-> require.packages.configure packageDefaults: main: "EntryPoint").to.throw Error, /already configured/, "Packages options can be configured multiple times"

  it "should not allow to configure plugin after plugin was initialized", ->
    require.packages.init "test"
    expect(-> require.packages.configure()).to.throw Error, /already configured/, "Packages options can be configured after packages are initialized"