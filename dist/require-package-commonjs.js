module.exports =
    (function(context) {
        function PatchRequireWithPackages(oldRequire) {
        
            var cache = {},         // map module name to package location
                packages = {},      // map package location to full package config
                multiPackages = [], // packages, where location is regexp or function, so it matches multiple paths
                                    // it produces new value for "packages" hash on every new path match
                parents = {};       // map module path to *direct* parent package
        
            var options = {
                "packageDefaults": {
                    "main": "index",
        
                    // Following options can be: string|regexp|function|array of all of these things
                    "public": false,    // package's internal files, available from outside of package
                    "external": false,  // external files, allowed to be required from inside package
                    "packages": false,  // nested packages
                    "protected": false, // package's internal files, available from inside nested packages
        
                    // props, which are "true" here, will be used as defaults for packages inside current one
                    // (means, will be applied *before* global defaults, but not *instead* of them)
                    "inheritable": {
                        "main": false,
                        "public": false,
                        "packages": false,
                        "protected": false,
                        "inheritable": true // whether children of current package will pass theirs inheritance settings to theirs children
                        // "external" is not listed here, as it is denied for children to have own external dependencies
                    }
                },
                "allowRemoteProtected": false // whether it is allowed for children to require 'protected' files not only of *direct* parent
            };
        
            // -----------------
        
            var modulesStack = ['**root**'];
        
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
        
            var isInitialized = false;
            var isConfigured = false;
        
            require.packages = {
                init: function(pkgs) {
                    if (isInitialized) {
                        throw new Error('Packages list already initialized');
                    }
                    isInitialized = true;
        
                    // Maybe, it is worth to deeply clone incoming data, to encapsulate them safely.
                    // But it will be verbose enough (as need to clone functions and regexps)
                    multiPackages = parseRawPackages(pkgs);
                    return true;
                },
        
                configure: function (config) {
                    if (isConfigured) {
                        throw new Error('Packages options already configured');
                    }
                    isConfigured = true;
                    extend(options, config);
                }
            };
        
            if ("packages" in oldRequire) {
                throw new Error("Can't apply 'require-packages' plugin: current 'require' function already has 'packages' property");
            }
        
            // don't forget to restore other properties
            for (var prop in oldRequire) {
                require[prop] = oldRequire[prop];
            }
        
        
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
                    if (!isPathAccessibleFromInsidePackage(modulePath, currentPkg)) {
                        // requiring something outside of all packages:
                        if (modulePkg === false) {
                            error = 'Access to out-of-package files from inside packages';
                        } else {
                        // requiring something inside another package:
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
        
            // whether we can require @modulePath, when we are inside @currentPkg:
            function isPathAccessibleFromInsidePackage(modulePath, currentPkg) {
                var targetPkg = getPackageForPath(modulePath);
        
                // When requiring module that is not in any package:
                // only paths from 'external' list are allowed,
                // and if current package is nested - than only parent's external files.
                // Because should be only one entry point for externals.
                if (targetPkg === false) {
                    return isMatches(modulePath, (hasParents(currentPkg) ? internal.findFarthestParent(currentPkg) : currentPkg).external);
                }
        
                // When requiring module from some package:
                return (targetPkg === currentPkg)                                      // own files are allowed, of course
                    || (isParent(currentPkg, targetPkg, true)                          // when parent requires child's files:
                        && (isPathLeadsToMainFileOfPackage(modulePath, targetPkg)      // - it can require main file
                            || pathForPackageIs('public', modulePath, targetPkg)))     // - or explicitly exposed files
                    || (isParent(targetPkg, currentPkg, !options.allowRemoteProtected) // when child requires parent's files:
                        && (!isPathLeadsToMainFileOfPackage(modulePath, currentPkg)    // - it can NOT require main file, because it is a top-level logic
                            && pathForPackageIs('protected', modulePath, targetPkg)))  // - and can require only explicitly allowed files ('protected', in OOP sense)
                    ;
            }
        
            // whether we can require @modulePath, when we are outside of ANY package:
            function isPathAccessibleFromOutsidePackage(modulePath) {
                var targetPkg = getPackageForPath(modulePath);
        
                // it's also some external file - don't care about it:
                if (targetPkg === false) { return true; }
        
                // it's file inside some package - so:
                return !hasParents(targetPkg)                                  // it can be available only if it is not nested package (and no matter to 'public' lists hierarchy!)
                    && (isPathLeadsToMainFileOfPackage(modulePath, targetPkg)  // and it is package itself (main file),
                        || pathForPackageIs('public', modulePath, targetPkg)); // or one of it's explicitly exposed files
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
                    if (isObject(rawPkg)) {
                        pkg = rawPkg;
                    } else {
                        pkg = { location: rawPkg };
                    }
        
                    if (parent) { inherit(pkg, parent); }
        
                    var hasOwnExternal = !!pkg.external;
        
                    defaults(pkg, options.packageDefaults);
        
                    // If is set default "external" value for all packages, we should not apply it to nested packages (as it is denied for them).
                    // But do not process explicitly set values, because it is yet a programmer's error.
                    if (!hasOwnExternal && !!options.packageDefaults.external && parent) {
                        delete pkg.external;
                    }
        
                    var originLocation = pkg.location;
                    pkg.location = joinLocations(parent, pkg);
        
                    if (isExactLocation(pkg.location)) {
                        savePackage(pkg, parent);
                        pkgs.splice(i, 1); // remove saved from raw set
                    } else {
                        // raw packages should have their origin location, to match only against corresponding part of path
                        pkg.location = originLocation;
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
        
                ensurePackageCanBeSaved(pkg, parentLocation);
        
                internal.insertPackage(pkg);
        
                var mainFilePath = getPkgMainPath(pkg);
        
                packages[pkg.location] = pkg;
        
                cache[pkg.location] = pkg.location;
                cache[mainFilePath] = pkg.location;
        
                // package is parent for it's main file
                parents[mainFilePath] = pkg.location;
                parents[pkg.location] = parentLocation;
        
                return pkg;
            }
        
            function ensurePackageCanBeSaved(pkg, parentLocation) {
                var hasParent = parentLocation.length > 0;
                if (hasParent) {
                    if (!!pkg.external) {
                        throw new Error(
                            'Nested packages can\'t have own "external" dependencies. \n' +
                            'Trace: package "' + pkg.location + '" inside package"' + parentLocation + '" has "external": ' + pkg.external
                        );
                    }
                }
                return true;
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
                if ((pkg = internal.findClosestParent(modulePath)) !== false) {
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
        
                var parts = trimPkgPath(modulePath, parentPath).split('/');
                for (var i = 0; i < parts.length; i++) {
                    testPath += (i > 0 ? '/' : '') + parts[i];
                    if (isMatches(testPath, rawPkg.location)) {
                        newPkg = deepClone(rawPkg);
                        newPkg.location = joinPath(parentPath, testPath);
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
        
                    findClosestParent: function (modulePath) {
                        if (sortedLocations.length === 0) { return false; } // yet no packages at all, so no parents can be
                        for (var i = getSortedIndex(modulePath); i >= 0; i--) {
                            if (isParent(sortedLocations[i], modulePath)) {
                                parents[modulePath] = sortedLocations[i];
                                return packages[sortedLocations[i]];
                            }
                        }
                        return false;
                    },
        
                    findFarthestParent: function (modulePath) {
                        if (sortedLocations.length === 0) { return false; }
                        for (var i = 0; i < sortedLocations.length; i++) {
                            if (isParent(sortedLocations[i], modulePath)) {
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
                if (isObject(pkgOrLocation)) {
                    return pkgOrLocation.location;
                } else {
                    return pkgOrLocation
                }
            }
        
            function isExactLocation(parent, child) {
                return typeof ensureLocation(parent) === 'string' && typeof ensureLocation(child) === 'string';
            }
        
            function rejectEmptyLocations() {
                var result = [];
                var args = [].slice.call(arguments);
                for (var i = 0; i < args.length; i++) {
                    var location = ensureLocation(args[i]);
                    if (location !== '') {
                        result.push(location);
                    }
                }
                return result;
            }
        
            function joinLocations(parent, child) {
                parent = ensureLocation(parent);
                child = ensureLocation(child);
                if (isExactLocation(parent, child)) {
                    return joinPath(parent, child);
                } else {
                    var nonEmptyLocations = rejectEmptyLocations(parent, child);
                    return nonEmptyLocations.length === 1
                        ? nonEmptyLocations[0]
                        : function (modulePath) {
                            // do not join patterns simply in array,
                            // because path must match to All locations, and in proper order
                            return isMatches(modulePath, nonEmptyLocations[0]) && isMatches(modulePath, nonEmptyLocations[1]);
                          }
                }
            }
        
            // common-purpose matcher
            function isMatches(str, pattern) {
                if (!pattern) {
                    return false;
                }
                if (isObject(pattern)) {
                    pattern = pattern.location;
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
                    throw new Error('Pattern should be either string, regexp, function or array');
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
                var location = ensureLocation(pkg);
                return location in parents && parents[location] !== '';
            }
        
            function isPathLeadsToMainFileOfPackage(modulePath, pkg) {
                return modulePath === pkg.location
                    || (isParent(pkg, modulePath, true) && modulePath.slice(-pkg.main.length) === pkg.main)
            }
        
            function pathForPackageIs(type, modulePath, pkg) { return isMatches(trimPkgPath(modulePath, pkg), pkg[type]); }
        
            function getPkgMainPath(pkg) { return joinPath(pkg.location, pkg.main) }
        
            function trimPkgPath(modulePath, pkg) {
                var len = ensureLocation(pkg).length;
                return len === 0 ? modulePath : modulePath.slice(len + 1); // +1 for slash
            }
        
        
            // -----------------
            // Common-purpose utilities (agnostic to plugin logic):
        
            function isObject(obj) { return typeof obj === 'object' && obj.constructor === Object; }
        
            function trimSlash(str) { return str.replace(/^\/+|\/+$/g, ''); }
        
            function pathLength(modulePath) { return modulePath.split('/').length; }
        
            function joinPath() {
                var path = '', i = -1, part, parts = [].slice.call(arguments);
                while (++i < parts.length) { part = parts[i]; if (part != null) { path += part + '/'; } }
                return trimSlash(path);
            }
        
            function defaults(dest) {
                var sources = [].slice.call(arguments, 1);
                for (var i = 0; i < sources.length; i++) {
                    var src = sources[i];
                    for (var key in src) if (src.hasOwnProperty(key)) {
                        var srcProp = src[key];
                        if (!dest.hasOwnProperty(key)) {
                            dest[key] = isObject(srcProp) ? deepClone(srcProp) : srcProp;
                        } else if (isObject(dest[key])) {
                            defaults(dest[key], srcProp);
                        }
                    }
                }
                return dest;
            }
        
            function extend(dest) {
                var sources = [].slice.call(arguments, 1);
                for (var i = 0; i < sources.length; i++) {
                    var src = sources[i];
                    for (var key in src) if (src.hasOwnProperty(key)) {
                        var srcProp = src[key];
                        if (isObject(srcProp) && isObject(dest[key])) {
                            extend(dest[key], srcProp);
                        } else {
                            dest[key] = isObject(srcProp) ? deepClone(srcProp) : srcProp;
                        }
                    }
                }
                return dest;
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
        
            // return patched function
            return require;
        
        }
    
        context.require = PatchRequireWithPackages(context.require);
    })
;