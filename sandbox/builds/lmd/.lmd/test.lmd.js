var sysPath = require("path");

var buildDir = sysPath.resolve(".");
var sandboxDir = sysPath.join(buildDir, "../..");
var rootDir = sysPath.join(sandboxDir, "app");
// absolute path to plugin:
var pluginPath = sysPath.join(sandboxDir, "../dist/require-package-lmd.js");

module.exports = {
    "name": "test build",
    "root": rootDir,
    "output": "../public/build.js", // relative to "root"
    "modules": {
        "<%= subdir %><%= file %>": "**/*.js",
        "main": [
            "packages_config.js",
            "index.js"
        ]
    },
    "main": "main",
    "plugins": {
        "require-package": sysPath.relative(rootDir, pluginPath) // and here MUST be *relative* path to "root"
    }
};