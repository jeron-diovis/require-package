(function (global) {

    var cache = {}, // map module name to package location
        packages = {}, // map package location to full package config
        rawPackages = [], // "multi-packages", where location is regexp or function
                          // it produces new value for "packages" hash on every new path match
        parents = {}; // map module path to _direct_ parent package

    var isInitialized = false;

    var options = {
        defaults: {
            "main": "main",
            // Following options can be: string|regexp|function|array of all of these things
            "public": false, // package's internal files, available from outside of package
            "external": false, // external files, allowed to be required from inside package
            "packages": false, // nested packages
            // TODO: implement this:
            "inheritable": false // package's internal files, available from inside nested packages
        },
        init: function(pkgs) {
            if (isInitialized) {
                throw new Error('Packages list already initialized');
            }
            isInitialized = true;

            // Maybe, it is worth to deeply clone incoming data, to encapsulate them safely.
            // But it will be verbose enough (as need to clone functions and regexps)
            rawPackages = parseRawPackages(pkgs);
            return true;
        }
    };

    // -----------------

    var oldRequire = global.require,
        modulesStack = ['**root**'];

    // -----------------

    function require(modulePath) {
        var parentPath = modulesStack[modulesStack.length - 1];
        ensurePathAccessible(modulePath, parentPath);

        var module, modulePkg = getPackageForPath(modulePath);
        //console.log('REQ:', modulePath, parentPath, modulePkg.location);

        if (modulePkg !== false) {
            if (modulePath === modulePkg.location) {
                modulePath = getPkgMainPath(modulePkg);
            }
        }

        modulesStack.push(modulePath);
        try {
            module = oldRequire(modulePath);
        } finally {
            // always return stack to previous state,
            // to avoid cumulative effects when chain of "require"s throws error somewhere in depths
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
    // "Business-logic". Restrictions of package-based modules system. The what is this plugin for:

    function ensurePathAccessible(modulePath, currentModulePath) {
        var currentPkg = getPackageForPath(currentModulePath);
        var modulePkg = getPackageForPath(modulePath);
        var error = false;

        // we are outside of any package:
        if (currentPkg === false) {
            if (!isPathAccessibleFromOutsidePackage(modulePath)) {
                error = 'Access to package internal files from outside of package';
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

    // whether we can require @modulePath, when we are inside @pkg:
    function isPathAccessibleFromInsidePackage(modulePath, pkg) {
        var modulePkg = getPackageForPath(modulePath);

        if (modulePkg === false) {
            // TODO: restrict 'external' to only non-packaged files
            return isMatches(modulePath, pkg.external);
        }

        /*console.log('check for from inside:', modulePath, pkg.location, modulePkg.location);
         console.log('pkgs equal:', modulePkg === pkg);
         console.log('isParent:', isParent(pkg, modulePkg));
         console.log('isLeadsToMain:', isPathLeadsToMainFileOfPackage(modulePath, modulePkg));
         console.log('Rel to pub:', modulePath.slice(modulePkg.location.length + 1), modulePkg.public);*/
        return (modulePkg === pkg)
            || (isParent(pkg, modulePkg, true)
                && (isPathLeadsToMainFileOfPackage(modulePath, modulePkg)
                    || isPathPublicForPackage(modulePath, modulePkg)));
    }

    // whether we can require @modulePath, when we are outside of ANY package:
    function isPathAccessibleFromOutsidePackage(modulePath) {
        var modulePkg = getPackageForPath(modulePath);

        // it's also some external file - don't care about it:
        if (modulePkg === false) { return true; }

        //console.log("has parents", hasParents(pkg));
        // it's file inside some package - so:
        return !hasParents(modulePkg)                                 // it can be available only if it is not nested package
            && (isPathLeadsToMainFileOfPackage(modulePath, modulePkg) // and it is package itself (main file),
                || isPathPublicForPackage(modulePath, modulePkg));    //     or one of it's explicitly exposed files
    }


    // -----------------
    // The heart. Parsing, saving, mapping, caching packages:

    function parseRawPackages(pkgs, parentLocation) {
        var pkg, rawPkg;

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
                savePackage(pkg, parentLocation);
                pkgs.splice(i, 1); // remove saved from raw set
            } else {
                pkgs[i] = pkg;
                ++i;
            }
            if (pkg.packages) {
                pkg.packages = parseRawPackages(pkg.packages, pkg.location);
                if (pkg.packages.length === 0) {
                    pkg.packages = false;
                }
            }
        }

        return pkgs;
    }

    function savePackage(pkg, parent) {
        var parentLocation = trimSlash(ensureLocation(parent));

        pkg.location = joinPath(parentLocation, pkg.location);

        var mainFilePath = getPkgMainPath(pkg);

        packages[pkg.location] = pkg;

        cache[pkg.location] = pkg.location;
        cache[mainFilePath] = pkg.location;

        if (parentLocation.length > 0) {
            parents[pkg.location] = parentLocation;
            parents[mainFilePath] = parentLocation;
        }
        return pkg;
    }

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

        return result;
    }

    // find module whose location given module path matches to
    function getPackageForPath(modulePath) {
        if (modulePath in packages) {
            return packages[modulePath];
        }

        if (modulePath in cache) {
            return cache[modulePath] !== false ? packages[cache[modulePath]] : false;
        }

        for (var pkgPath in packages) {
            var pkg = packages[pkgPath];
            if (isPathInPackage(modulePath, pkg)) {
                var parentPkg;
                while (pkg && pkg.packages) {
                    parentPkg = pkg;
                    pkg = parseMultipathPackages(modulePath, parentPkg.packages, parentPkg.location);
                }
                pkg = pkg || parentPkg;
                cache[modulePath] = pkg.location;
                return pkg;
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
        var testPath = '', newPkg, foundPackages = 0;

        //console.log("parse " + modulePath + ' inside ' + parentPath);
        var parts = trimPkgPath(modulePath, parentPath).split('/');
        for (var i = 0; i < parts.length; i++) {
            testPath += (i > 0 ? '/' : '') + parts[i];
            if (isMatches(testPath, rawPkg.location)) {
                newPkg = deepClone(rawPkg);
                newPkg.location = testPath;
                savePackage(newPkg, parentPath);
                // each time override cache, so in cache is always the most-specific path:
                cache[modulePath] = newPkg.location;
                ++foundPackages;
            }
        }

        return foundPackages > 0;
    }


    // -----------------
    // Internal logic utilities:

    function ensureLocation(pkgOrLocation) {
        if (!pkgOrLocation) { return ''; }
        if (typeof pkgOrLocation !== 'string') {
            return pkgOrLocation.location;
        } else {
            return pkgOrLocation;
        }
    }

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

    function isParent(parent, child, direct) {
        if (parent === child) { return false; }
        parent = ensureLocation(parent);
        child = ensureLocation(child);
        if (direct) {
            return parents[child] === parent;
        } else {
            return child.indexOf(parent) === 0;
        }
    }

    function hasParents(pkg) {
        return ensureLocation(pkg) in parents;
    }

    function isPathLeadsToMainFileOfPackage(modulePath, pkg) {
        return modulePath === pkg.location
            || (isParent(pkg, modulePath) && modulePath.slice(-pkg.main.length) === pkg.main)
    }

    function isPathPublicForPackage(modulePath, pkg) {
        return isMatches(trimPkgPath(modulePath, pkg), pkg.public);
    }

    function getPkgMainPath(pkg) {
        return joinPath(pkg.location, pkg.main)
    }

    function trimPkgPath(modulePath, pkg) {
        var len = ensureLocation(pkg).length;
        return len === 0 ? modulePath : modulePath.slice(len + 1); // +1 for slash
    }


    // -----------------
    // Common-purpose utilities (agnostic to plugin logic):

    function defaults(dest, src) { for (var key in src) if (src.hasOwnProperty(key) && !dest.hasOwnProperty(key)) { dest[key] = src[key]; } }

    function trimSlash(str) { return str.replace(/^\/|\/$/g, ''); }

    function joinPath() {
        var path = '', i, part;
        for (i in arguments) { part = arguments[i]; if (part != null) { path += part + '/'; } }
        return trimSlash(path);
    }

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

    // -----------------

})(this);