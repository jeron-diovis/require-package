cache = {}

{require, define} = do ->
  require: (name) ->
    #console.log "require:", name, cache[name]
    cache[name]?()
  define: (name, fn) ->
    cache[name] = fn
    #console.log "define:", name, cache[name]

beforeEach -> cache = {}
