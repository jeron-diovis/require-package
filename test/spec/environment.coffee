describe "environment", ->
  it "should provide 'require' and 'define' functions", ->
    expect(define).is.a "function"
    expect(require).is.a "function"

  it "should allow define and require modules", ->
    define "very_base_test", -> "It works!"
    expect(require "very_base_test").is.equal "It works!"