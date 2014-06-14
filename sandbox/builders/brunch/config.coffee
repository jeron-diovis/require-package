sandboxRoot = "../.."
appRoot = "#{sandboxRoot}/app"

pluginPath = "#{sandboxRoot}/../dist/require-package.js"

entryPoint = "#{appRoot}/index.js"

vendor = [
  pluginPath
  "#{appRoot}/packages_config.js"
]

exports.config =
  paths:
    public: "#{sandboxRoot}/public"
    watched: [appRoot, pluginPath]
  sourceMaps: no
  modules:
    nameCleaner: (path) -> path.replace /// ^#{appRoot}\/ ///, ''
  conventions:
    vendor: [
      vendor...
      entryPoint
    ]
  files:
    javascripts:
      joinTo: "build.js"
      order:
        before: vendor
        after: entryPoint