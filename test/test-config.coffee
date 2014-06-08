require = define = null

# ----------

# reset plugin and all caches, so it is guaranteed that will be no side-effects in each test
do ->
  makeLoaders = -> do ->
    cache = {}
    require: (name) -> cache[name]?()
    define: (name, fn) -> cache[name] = fn

  beforeEach -> {require, define} = makeTestEnv(makeLoaders())