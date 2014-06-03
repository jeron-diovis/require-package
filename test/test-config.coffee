require = define = null

# ----------

# reset plugin and all caches, so it is guaranteed that will be no side-effects in each test
do ->
  makeLoaders = -> do ->
    cache = {}
    require: (name) ->
      #console.log "req:", name, cache[name], cache
      cache[name]?()
    define: (name, fn) -> cache[name] = fn

  beforeEach -> {require, define} = makeTestEnv(makeLoaders())

# ----------

# utils
extend = (dest, src) -> dest[key] = val for key, val of src; dest
clone = (src) -> extend {}, src

cfg = null
do ->
  # Reset global defaults for each test.
  # In tests it is allowed to refer shortcut "cfg" instead of "require.packages.defaults".
  prevCfg = null

  beforeEach ->
    cfg = require.packages.defaults
    prevCfg = clone cfg
    # set defaults, so tests are not depend from changing of defaults in plugin
    extend cfg,
      "main": "main"
      "public": false
      "external": false
      "packages": false
      "inheritable": false

  afterEach -> require.packages.defaults = clone prevCfg
