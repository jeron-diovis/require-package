(function (global) {

    var cache = {}, // map module name to package location
        packages = {}, // map package location to full package config
        multiPackages = [],// packages, where location is regexp or function, so it matches multiple path
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
            "protected": false, // package's internal files, available from inside nested packages

            // props, which are true here, will be used as defaults for packages inside current one
            // (means, will be applied *before* global defaults, but not instead of them)
            "inheritable": {
                "main": false,
                "public": false,
                "external": false,
                "packages": false,
                "protected": false,
                "inheritable": true
            }
        },
        init: function(pkgs) {
            if (isInitialized) {
                throw new Error('Packages list already initialized');
            }
            isInitialized = true;

            // Maybe, it is worth to deeply clone incoming data, to encapsulate them safely.
            // But it will be verbose enough (as need to clone functions and regexps)
            multiPackages = parseRawPackages(pkgs);
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

        var mmodule, modulePkg = getPackageForPath(modulePath);

        if (modulePkg !== false) {
            if (modulePath === modulePkg.location) {
                modulePath = getPkgMainPath(modulePkg);
            }
        }

        modulesStack.push(modulePath);
        try {
            mmodule = oldRequire(modulePath);
        } finally {
            // always return stack to previous state,
            // to avoid cumulative effects when chain of "require"s throws error somewhere in depths
            modulesStack.pop();
        }
        return mmodule;
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
            // or, maybe, to only parent's externals
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

    function parseRawPackages(pkgs, parent) {
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

            if (parent) { inherit(pkg, parent); }
            defaults(pkg, options.defaults);

            if (typeof pkg.location === 'string') {
                savePackage(pkg, parent ? parent.location : null);
                pkgs.splice(i, 1); // remove saved from raw set
            } else {
                pkgs[i] = pkg;
                ++i;
            }
            if (pkg.packages) {
                pkg.packages = parseRawPackages(pkg.packages, pkg);
                if (pkg.packages.length === 0) {
                    pkg.packages = false;
                }
            }
        }

        return pkgs;
    }

    function inherit(child, parent) {
        var props = {};
        for (var key in parent.inheritable) {
            if (parent.inheritable[key] === true) {
                props[key] = parent[key];
            }
        }
        defaults(child, props);
        return child;
    }

    function savePackage(pkg, parent) {
        var parentLocation = trimSlash(ensureLocation(parent));

        pkg.location = joinPath(parentLocation, pkg.location);

        var mainFilePath = getPkgMainPath(pkg);

        packages[pkg.location] = pkg;
        internal.insertPackage(pkg);

        cache[pkg.location] = pkg.location;
        cache[mainFilePath] = pkg.location;

        if (parentLocation.length > 0) {
            parents[pkg.location] = parentLocation;
            parents[mainFilePath] = parentLocation;
        }
        return pkg;
    }

    // find module whose location given module path matches to
    function getPackageForPath(modulePath) {
        if (modulePath in packages) {
            return packages[modulePath];
        }

        if (modulePath in cache) {
            return cache[modulePath] !== false ? packages[cache[modulePath]] : false;
        }

        var pkg, parentPkg;
        if ((pkg = internal.findClosestPackage(modulePath)) !== false) {
            while (pkg && pkg.packages) {
                parentPkg = pkg;
                pkg = parseMultipathPackages(modulePath, parentPkg.packages, parentPkg.location);
            }
            pkg = pkg || parentPkg;
            cache[modulePath] = pkg.location;
            return pkg;
        }

        if (pkg = parseMultipathPackages(modulePath, multiPackages)) {
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
                //console.log('clone pkg:', testPath, rawPkg);
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

    // Mechanism for quick search closest parent package for any module path.
    // Keeps all found packages locations sorted by path length,
    // to immediately start search from lengths, closest to given path length,
    // without overhead of iterating through obviously non-matched paths.
    var internal = (function () {
        var sortedLocations = [];
        var sortedLengths = [-Infinity, Infinity];
        var lengthToIndex = {}; // { path length : index of last path with such length in sortedLocations }

        function findClosestIndex(pathLength) {
            for (var i = 0; i < sortedLengths.length - 1; i++) {
                if (pathLength > sortedLengths[i] && pathLength < sortedLengths[i + 1]) { return i; }
            }
            return -1;
        }

        // index of module path in sortedLocations, if it would be saved there
        function getSortedIndex(modulePath) {
            var len = pathLength(modulePath);
            if (!(len in lengthToIndex)) {
                var i = findClosestIndex(len);
                sortedLengths.splice(i + 1, 0, len);
                var prev = lengthToIndex[sortedLengths[i]];
                lengthToIndex[len] = (prev != null ? prev : -1);
            }
            return lengthToIndex[len];
        }

        return {
            // save new found package to sorted locations list
            // so it can be recognized as someones parent later
            insertPackage: function (pkg) {
                var location = pkg.location;
                sortedLocations.splice(getSortedIndex(location) + 1, 0, location);
                var len = pathLength(location);
                // as new path inserted, positions of all longer paths are cascadely increased
                for (var i in lengthToIndex) { if (i >= len) { ++lengthToIndex[i]; } }
            },

            findClosestPackage: function (modulePath) {
                if (sortedLocations.length === 0) { return false; } // yet no packages at all, so no parents can be
                for (var i = getSortedIndex(modulePath); i >= 0; i--) {
                    if (isParent(sortedLocations[i], modulePath)) {
                        parents[modulePath] = sortedLocations[i];
                        return packages[sortedLocations[i]];
                    }
                }
                return false;
            }
        }
    })();


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

    function hasParents(pkg) { return ensureLocation(pkg) in parents; }

    function isPathLeadsToMainFileOfPackage(modulePath, pkg) {
        return modulePath === pkg.location
            || (isParent(pkg, modulePath) && modulePath.slice(-pkg.main.length) === pkg.main)
    }

    function isPathPublicForPackage(modulePath, pkg) {
        return isMatches(trimPkgPath(modulePath, pkg), pkg.public);
    }

    function getPkgMainPath(pkg) { return joinPath(pkg.location, pkg.main) }

    function trimPkgPath(modulePath, pkg) {
        var len = ensureLocation(pkg).length;
        return len === 0 ? modulePath : modulePath.slice(len + 1); // +1 for slash
    }


    // -----------------
    // Common-purpose utilities (agnostic to plugin logic):

    function isObject(obj) { return typeof obj === 'object' && obj.constructor === Object; }

    function defaults(dest) {
        var sources = [].slice.call(arguments, 1);
        for (var i = 0; i < sources.length; i++) {
            var src = sources[i];
            for (var key in src) if (src.hasOwnProperty(key)) {
                if (!dest.hasOwnProperty(key)) {
                    dest[key] = isObject(src[key]) ? deepClone(src[key]) : src[key];
                } else if (isObject(dest[key])) {
                    defaults(dest[key], src[key]);
                }
            }
        }
        return dest;
    }

    function trimSlash(str) { return str.replace(/^\/|\/$/g, ''); }

    function pathLength(modulePath) { return modulePath.split('/').length; }

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
            } else if (isObject(val)) {
                clone[prop] = deepClone(val);
            } else {
                clone[prop] = val;
            }
        }
        return clone;
    }

    // -----------------

})(this);