/**
 * Add packages restrictions for LMD "require" function
 *
 * Do not use events-based approach, recommended in LMD plugins tutorial
 * (that is, "sandbox.on('lmd-register:decorate-require', ..."),
 * because decoration is performed for each module separately,
 * while we need to initialize packages cache once and globally for all modules.
 */
(function(sandbox) {
    //=./factory.js
    (sandbox);

    // 'lmd_require' refers to variable from internal LMD scope
    lmd_require = sandbox.require;
})(sandbox);
