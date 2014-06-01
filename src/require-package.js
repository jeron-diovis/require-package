(function (global) {

    var cache = {}, // map module name to package location
        packages = {}, // map package location to full package config
        rawPackages = []; // "multi-packages", where location is regexp or function
                          // it produces new value for "packages" hash on every new path match

    var isInitialized = false;

    var options = {
        defaults: {
            "main": "main",
            // Following options can be: string|regexp|function|array of all of these things
            "public": false, // package's internal files, available from outside of package
            "external": false, // external files, allowed to be required from inside package
            "packages": false // nested packages
        },
        init: function(pkgs) {
            if (isInitialized) {
                throw new Error('Packages list already initialized');
            }
            isInitialized = true;
            rawPackages = initialize(pkgs);
            return true;
        }
    };

    // -----------------

    var oldRequire = global.require,
        modulesStack = ['__root__'];

    // -----------------


    function require(modulePath) {
        var parentPath = modulesStack[modulesStack.length - 1];
        ensurePathAccessible(modulePath, parentPath);

        var module, modulePkg = getPackageForPath(modulePath);
     //   console.log(modulePath, modulePkg);

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

    function initialize(pkgs) {
        var pkg, rawPkg;

        // Maybe, it is worth to deeply clone incoming data, to encapsulate them safety.
        // But it will be verbose enough (as need to clone functions and regexps)
        if (pkgs.constructor !== Array) {
            pkgs = [pkgs];
        } else {
            pkgs = pkgs.slice();
        }

        var i = 0;
        while (i < pkgs.length) {
            rawPkg = pkgs[i];
            if (typeof rawPkg === 'object' && rawPkg.constructor === Object) {
                pkg = rawPkg;
            } else {
                pkg = { location: rawPkg };
            }
            defaults(pkg, options.defaults);

            if (typeof pkg.location === 'string') {
                pkg.location = pkg.location.replace(/\/$/, '');
                // exact locations are always stored in global cache:
                packages[pkg.location] = pkg;
                pkgs.splice(i, 1);
            } else {
                pkgs[i] = pkg;
                ++i;
            }
            if (pkg.packages) {
                pkg.packages = initialize(pkg.packages);
            }
        }

        return pkgs;
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

    function isParent(parent, child) {
        if (parent === child) { return false; }
        if (typeof child !== 'string') { child = child.location; }
        if (typeof parent !== 'string') { parent = parent.location; }
        return child.indexOf(parent) === 0;
    }

    function isPathLeadsToMainFileOfPackage(modulePath, pkg) {
        return modulePath === pkg.location
            || (isParent(pkg.location, modulePath) && modulePath.slice(-pkg.main.length) === pkg.main)
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
            result = isParent(pkg, modulePath);
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
                var nestedPkg;
                //console.log('pkg found:', modulePath, pkg.location, pkg.packages);
                if (pkg.packages && (nestedPkg = parseMultipathPackages(modulePath, pkg.packages, pkg.location))) {
                //    console.log('IsNested', modulePath, nestedPkg);
                    return nestedPkg;
                } else {
                    return pkg;
                }
            }
        }

        if (pkg = parseMultipathPackages(modulePath, rawPackages)) {
            return pkg;
        }

        cache[modulePath] = false;
        return false;
    }

    function parseMultipathPackages(modulePath, rawPkgs, parentPath) {
        for (var i = 0; i < rawPkgs.length; i++) {
            var rawPkg = rawPkgs[i];
            if (parseMultipathPackage(modulePath, rawPkg, parentPath)) {
                return getPackageForPath(modulePath);
            }
        }
        return false;
    }

    // Match module path against multi-paths package and store all found matches as separate "single-path" packages.
    // Checks all possible subpaths of source path, level-by-level from root
    function parseMultipathPackage(modulePath, rawPkg, parentPath) {
        var testPath = "",
            newPkg,
            foundPackages = 0;

        parentPath || (parentPath = '');
        if (parentPath.length > 0) { parentPath += '/' }

        var parts = (!parentPath ? modulePath : modulePath.slice(parentPath.length)).split('/');

        for (var i = 0; i < parts.length; i++) {
            if (i > 0) { testPath += '/'; }
            testPath += parts[i];

            if (isMatches(testPath, rawPkg.location)) {
                newPkg = deepClone(rawPkg);
                newPkg.location = parentPath + testPath;
                packages[newPkg.location] = newPkg;
                // each time override cache, so in cache is always the most-specific path:
                cache[modulePath] = newPkg.location;
                ++foundPackages;
            }
        }

        return foundPackages > 0;
    }

    function isPathAccessibleFromInsidePackage(modulePath, pkg) {
        var modulePkg = getPackageForPath(modulePath);

        var result = false;

        if (modulePkg === false) {
            result = isMatches(modulePath, pkg.external);
        } else {
            result = (modulePkg === pkg)
                    || (isParent(pkg, modulePkg) && isPathLeadsToMainFileOfPackage(modulePath, modulePkg) )
        }

        return result;
    }

    function isPathAccessibleFromOutsidePackage(modulePath, pkg) {
        var modulePkg = getPackageForPath(modulePath);

        if (modulePkg === pkg) {
            return (modulePath === pkg.location)
                || (modulePath === pkg.location + '/' + pkg.main)
                || isMatches(modulePath.slice(pkg.location.length + 1), pkg.public); // +1 for slash
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