(function (global) {

    var cache = {}, // map module name to package location
        packages = {}, // map package location to full package config
        rawPackages = []; // "multi-packages", where location is regexp or function
                          // it produces new value for "packages" hash on every new path match

    var options = {
        defaults: {
            "main": "main",
            // Following two options can be: string|regexp|function|array of all of these things
            "public": false, // package's internal files, available from outside of package
            "external": false // external files, allowed to be required from inside package
        },
        init: initialize
    };

    // -----------------

    var oldRequire = global.require,
        modulesStack = ['__root__'];

    // -----------------


    function require(modulePath) {
        var parentPath = modulesStack[modulesStack.length - 1];
        ensurePathAccessible(modulePath, parentPath);

        var module, modulePkg = getPackageForPath(modulePath);

        if (modulePkg !== false) {
            if (modulePath === modulePkg.location) {
                modulePath += '/' + modulePkg.main;
            }
        }

        modulesStack.push(modulePath);
        try {
            module = oldRequire(modulePath);
        } finally {
            modulesStack.pop();
        }
        return module;
    }

    require.packages = options;
    // don't forget to restore other properties
    for (var prop in oldRequire) {
        require[prop] = oldRequire[prop];
    }
    global.require = require;

    // -----------------

    // The heart. Restrictions of package-based modules system:
    function ensurePathAccessible(modulePath, currentModulePath) {
        var currentPkg = getPackageForPath(currentModulePath);
        var modulePkg = getPackageForPath(modulePath);
        var error = false;

        // we are outside of any package:
        if (currentPkg === false) {
            // requiring something inside some package:
            if (modulePkg !== false) {
                if (!isPathAccessibleFromOutsidePackage(modulePath, modulePkg)) {
                    error = 'Access to package internal files from outside of package';
                }
            }
        }
        // we are inside some package:
        else {
            // requiring something outside of all packages:
            if (modulePkg === false) {
                if (!isPathAccessibleFromInsidePackage(modulePath, currentPkg)) {
                    error = 'Access to out-of-package files from inside packages';
                }
            }
            // requiring something inside some package:
            else {
                if (!isPathAccessibleFromInsidePackage(modulePath, currentPkg)) {
                    error = 'Cross-package access';
                }
            }
        }

        if (error) {
            error += ' is denied!\nAttempt to access "' + modulePath + '" from "' + currentModulePath + '"';
            throw new Error(error);
        }

        return true;
    }

    // -----------------

    var isInitialized = false;

    function initialize(pkgs) {
        if (isInitialized) { throw new Error('Packages list already initialized'); }
        isInitialized = true;

        var pkg, rawPkg;

        // Maybe, it is worth to deeply clone incoming data, to encapsulate them safety.
        // But it will be verbose enough (as need to clone functions and regexps)
        rawPackages = pkgs;
        if (!rawPackages.constructor === Array) {
            rawPackages = [rawPackages];
        }

        var i = 0;
        while (i < rawPackages.length) {
            rawPkg = rawPackages[i];
            if (typeof rawPkg === 'object' && rawPkg.constructor === Object) {
                pkg = rawPkg;
            } else {
                pkg = { location: rawPkg };
            }
            defaults(pkg, options.defaults);

            if (typeof pkg.location === 'string') {
                packages[pkg.location] = pkg;
                rawPackages.splice(i, 1);
            } else {
                rawPackages[i] = pkg;
                ++i;
            }
        }

        return true;
    }

    // -----------------

    // common-purpose matcher
    function isMatches(str, pattern) {
        if (!pattern) {
            return false;
        }
        if (typeof pattern === 'string') {
            return str === pattern;
        } else if (pattern.constructor === RegExp) {
            return pattern.test(str);
        } else if (typeof pattern === 'function') {
            return pattern(str);
        } else if (pattern.constructor === Array) {
            for (var i = 0; i < pattern.length; i++) {
                if (isMatches(str, pattern[i])) {
                    return true;
                }
            }
            return false;
        } else {
            throw new Error('Pattern should be either string, regexp, or function');
        }
    }

    // -----------------

    // check whether given path is inside given package (or inside any package, if no particular package given)
    function isPathInPackage(modulePath, pkg) {
        if (modulePath in cache) {
            return cache[modulePath] !== false;
        }

        var result;
        if (!pkg) {
            pkg = getPackageForPath(modulePath);
            result = pkg !== false;
        } else {
            result = modulePath.indexOf(pkg.location) === 0;
        }

        if (result) {
            cache[modulePath] = pkg.location;
        }

        return result;
    }

    // find _first_ module whose location given module path matches to
    function getPackageForPath(modulePath) {
        if (modulePath in cache) {
            return cache[modulePath] !== false ? packages[cache[modulePath]] : false;
        }

        for (var pkgPath in packages) {
            var pkg = packages[pkgPath];
            if (isPathInPackage(modulePath, pkg)) {
                return pkg;
            }
        }

        for (var i = 0; i < rawPackages.length; i++) {
            var rawPkg = rawPackages[i];
            if (parseModulePathForPackages(modulePath, rawPkg)) {
                return getPackageForPath(modulePath);
            }
        }

        cache[modulePath] = false;
        return false;
    }

    // Match module maths against multi-paths package and stores all found matches as separate "single-path" packages.
    // Checks all possible subpaths of source path, level-by-level from root,
    function parseModulePathForPackages(modulePath, rawPkg) {
        var parts = modulePath.split('/'),
            testPath = "",
            newPkg,
            foundPackages = 0;
        for (var i = 0; i < parts.length; i++) {
            if (i > 0) { testPath += '/'; }
            testPath += parts[i];

            if (isMatches(testPath, rawPkg.location)) {
                newPkg = deepClone(rawPkg);
                newPkg.location = testPath;
                packages[testPath] = newPkg;
                cache[modulePath] = newPkg.location;
                ++foundPackages;
            }
        }

        return foundPackages > 0;
    }

    function isPathAccessibleFromInsidePackage(modulePath, pkg) {
        var modulePkg = getPackageForPath(modulePath);

        if (modulePkg === false) {
            return isMatches(modulePath, pkg.external);
        } else if (modulePkg === pkg) {
            return true;
        }

        return false;
    }

    function isPathAccessibleFromOutsidePackage(modulePath, pkg) {
        var modulePkg = getPackageForPath(modulePath);

        if (modulePkg === pkg) {
            return (modulePath === pkg.location)
                || (modulePath === pkg.location + '/' + pkg.main)
                || isMatches(modulePath.slice(pkg.location.length + 1), pkg.public);
        }

        return true;
    }

    // -----------------

    // Some utils

    function deepClone(obj) {
        var clone = {};
        for (var prop in obj) if (obj.hasOwnProperty(prop)) {
            var val = obj[prop];
            if (val.constructor === Array) {
                clone[prop] = val.slice();
            } else if (typeof val === 'object' && val.constructor === Object) {
                clone[prop] = deepClone(val);
            } else {
                clone[prop] = val;
            }
        }
        return clone;
    }

    function defaults(dest, src) { for (var key in src) if (src.hasOwnProperty(key) && !dest.hasOwnProperty(key)) { dest[key] = src[key]; } }

    // -----------------

}(window));